import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withRepeat, Easing, cancelAnimation, runOnJS,
  useReducedMotion, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { colors } from '../../theme';
import { useAuthStore } from '../../store/authStore';
import { useSplashStore } from '../../store/splashStore';
import { firstNameOf, greetingFor, spinAngleAt, splashModeFor, SPLASH_TIMING as T, type SplashMode } from '../../logic/splash';

// Animated launch splash. Takes over from the native splash (same ink #0C0E14 ground, see
// app.json → splash) and covers the app while the session restores, then plays one of two endings
// (src/logic/splash.ts): 'returning' settles the mark with a greeting below it and zooms away into
// the app (the logo stays the plain brand mark — nothing personal is drawn inside it); 'welcome' writes the wordmark in and glides the whole hero up onto the login
// screen's own hero, so the splash dissolves INTO login rather than cutting to it.
//
// Every frame runs on the UI thread from four linear clocks (intro / stage / exit / ripple), each
// element easing its own slice — the JS thread is busy mounting the first screen underneath, so
// nothing here waits on it. Tap to skip once the ending has started; Reduce Motion gets a still frame.

// Geometry shared with app/(auth)/login.tsx — the welcome ending lands exactly on its hero.
const BOX = 104;              // login hero logo box
const LOGIN_LOGO = 92;        // KBLogo size inside that box
const LOGIN_HERO_TOP = 32;    // scroll paddingTop 24 + hero paddingTop 8, below the safe-area top
const LOGIN_SPIN_MS = 14000;  // login turns its mark once every 14 s
const LOGIN_MOUNT_LAG = 120;  // login mounts about a commit after the session restore resolves

const MARK = 156;             // pinwheel render size: drawn at its largest and scaled DOWN, so always crisp
const S_INTRO = 124 / MARK;   // on-screen size while it blooms
const S_LOGIN = LOGIN_LOGO / MARK;
const RETURN_SIZE = 148;      // returning: the mark settles a touch larger, the greeting sits below it
const S_RETURN = RETURN_SIZE / MARK;
const HUB = MARK * (190 / 1024);
const RING = 320;
const HALO = 240;              // login's LogoHalo
// Same blade order as KBLogo / the launcher icon (scripts/gen-icons.js).
const BLADES = [colors.cream, colors.blue, colors.teal, colors.orange, colors.coral, colors.purple];
const WORD = 'KBiz 360'.split('');

// Built once on the JS thread and captured by the exit worklet (not rebuilt on the UI thread).
const EXIT_EASING = Easing.in(Easing.quad);

const WELCOME = 1;
const RETURNING = 2;

function seg(t: number, from: number, to: number): number {
  'worklet';
  const p = (t - from) / (to - from);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
function easeOut(p: number): number {
  'worklet';
  return 1 - (1 - p) ** 3;
}
function easeInOut(p: number): number {
  'worklet';
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
}
function backOut(p: number): number {
  'worklet';
  const c = 1.70158;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
}

// Same layered glow as the login screen, so the welcome hand-off has nothing to crossfade.
function SplashAurora({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="sa" cx="18%" cy="8%" r="55%">
          <Stop offset="0" stopColor={colors.primary} stopOpacity="0.42" />
          <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sb" cx="92%" cy="86%" r="62%">
          <Stop offset="0" stopColor={colors.accent} stopOpacity="0.28" />
          <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sc" cx="88%" cy="6%" r="45%">
          <Stop offset="0" stopColor={colors.teal} stopOpacity="0.20" />
          <Stop offset="1" stopColor={colors.teal} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#sa)" />
      <Rect width={width} height={height} fill="url(#sb)" />
      <Rect width={width} height={height} fill="url(#sc)" />
    </Svg>
  );
}

function SplashHalo() {
  return (
    <Svg width={HALO} height={HALO}>
      <Defs>
        <RadialGradient id="sh" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.primary} stopOpacity="0.55" />
          <Stop offset="0.55" stopColor={colors.accent} stopOpacity="0.18" />
          <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={HALO / 2} cy={HALO / 2} r={HALO / 2} fill="url(#sh)" />
    </Svg>
  );
}

// One pinwheel blade. All six start stacked on the first blade's angle and fan out clockwise to
// their own, one after another — the mark assembles like a hand fan opening.
function Blade({ index, color, intro }: { index: number; color: string; intro: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const start = 80 + index * 55;
    const p = easeOut(seg(intro.value, start, start + 520));
    return {
      opacity: seg(intro.value, start, start + 140),
      transform: [{ rotate: `${index * 60 * p}deg` }, { scale: 0.5 + 0.5 * p }],
    };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={MARK} height={MARK} viewBox="0 0 1024 1024">
        <Rect x={477} y={212} width={210} height={300} rx={46} fill={color} />
      </Svg>
    </Animated.View>
  );
}

function Ripple({ index, ripple }: { index: number; ripple: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = seg(ripple.value, index * 0.18, index * 0.18 + 0.82);
    return {
      opacity: p > 0 ? 0.55 * (1 - p) : 0,
      transform: [{ scale: 0.42 + 0.58 * easeOut(p) }],
    };
  });
  return (
    <Animated.View
      style={[{
        position: 'absolute', left: (BOX - RING) / 2, top: (BOX - RING) / 2, width: RING, height: RING,
        borderRadius: RING / 2, borderWidth: 1.5, borderColor: index === 0 ? colors.teal : colors.primary,
      }, style]}
    />
  );
}

// Wordmark letter for the welcome ending: rises into place, staggered left to right.
function Letter({ ch, index, stage }: { ch: string; index: number; stage: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = seg(stage.value, 100 + index * 45, 520 + index * 45);
    return { opacity: p, transform: [{ translateY: 20 * (1 - easeOut(p)) }] };
  });
  return (
    <Animated.Text style={[{ fontSize: 42, color: colors.paper, letterSpacing: -1.5, fontWeight: '800' }, style]}>
      {ch}
    </Animated.Text>
  );
}

// A line of the welcome/returning copy that fades up over [from, to] of the ending's clock.
function useRise(stage: SharedValue<number>, from: number, to: number, dist = 10) {
  return useAnimatedStyle(() => {
    const p = seg(stage.value, from, to);
    return { opacity: p, transform: [{ translateY: dist * (1 - easeOut(p)) }] };
  });
}

export interface AnimatedSplashProps {
  /** The persisted session + prefs are restored (the gate underneath can decide where to go). */
  ready: boolean;
  /** Called once the splash has fully faded — unmount it. */
  onDone: () => void;
}

export function AnimatedSplash({ ready, onDone }: AnimatedSplashProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const user = useAuthStore((s) => s.user);

  const [mode, setMode] = useState<SplashMode | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const readyAt = useRef(0);
  const started = useRef(false);
  const done = useRef(false);

  const intro = useSharedValue(0);   // ms into the intro
  const stage = useSharedValue(0);   // ms into the ending
  const exit = useSharedValue(0);    // 0 → 1 fade-out
  const ripple = useSharedValue(0);  // 0 → 1 rings
  const breathe = useSharedValue(0.5);
  const modeSV = useSharedValue(0);
  const land = useSharedValue(0);    // welcome: total turn that lands on the login logo's angle

  // Fully faded: release the login screen's sign-in card (it slides up only now, after the logo).
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    useSplashStore.getState().handOff();
    onDone();
  }, [onDone]);

  // However the splash goes away, the login card must never stay held back.
  useEffect(() => () => useSplashStore.getState().handOff(), []);

  // Intro: starts on the very first frame, before anyone knows who is signed in.
  useEffect(() => {
    if (reduceMotion) {
      intro.value = T.intro;
      setIntroDone(true);
      return;
    }
    intro.value = withTiming(T.intro, { duration: T.intro, easing: Easing.linear });
    ripple.value = withDelay(560, withTiming(1, { duration: 1300, easing: Easing.linear }));
    breathe.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true);
    const t = setTimeout(() => setIntroDone(true), T.intro - T.introOverlap);
    return () => clearTimeout(t);
  }, [reduceMotion, intro, ripple, breathe]);

  // The session is restored: pick the ending once (a mid-splash change never swaps it).
  useEffect(() => {
    if (!ready || readyAt.current) return;
    readyAt.current = Date.now();
    setMode(splashModeFor(useAuthStore.getState().status === 'signedIn'));
  }, [ready]);

  // Never trap anyone behind the splash, whatever happens to the animations.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(finish, T.failsafe);
    return () => clearTimeout(t);
  }, [ready, finish]);

  // Ending + exit, chained on the UI thread.
  useEffect(() => {
    if (!mode || !introDone || started.current) return;
    started.current = true;
    const phaseMs = mode === 'welcome' ? T.welcome : T.returning;
    if (mode === 'welcome') {
      // Predict where login's own spinning logo will point mid-hand-off and turn to meet it.
      const handoffAt = Date.now() + phaseMs + T.exit / 2;
      const a = spinAngleAt(handoffAt - (readyAt.current + LOGIN_MOUNT_LAG), LOGIN_SPIN_MS);
      land.value = a < 180 ? a + 360 : a;
    }
    modeSV.value = mode === 'welcome' ? WELCOME : RETURNING;
    const fadeOut = (delay: number) => {
      'worklet';
      exit.value = withDelay(delay, withTiming(1, { duration: T.exit, easing: EXIT_EASING }, (fin) => {
        if (fin) runOnJS(finish)();
      }));
    };
    if (reduceMotion) {
      stage.value = phaseMs;
      fadeOut(T.reducedHold);
      return;
    }
    stage.value = withTiming(phaseMs, { duration: phaseMs, easing: Easing.linear }, (fin) => {
      if (!fin) return;
      runOnJS(setLeaving)(true);
      fadeOut(0);
    });
  }, [mode, introDone, reduceMotion, finish, stage, exit, modeSV, land]);

  // Tap to skip: snap to the ending's last frame (welcome: hero already on login's) and fade.
  const skip = () => {
    if (!started.current || leaving || !mode) return;
    setLeaving(true);
    cancelAnimation(stage);
    stage.value = withTiming(mode === 'welcome' ? T.welcome : T.returning, { duration: 160 });
    exit.value = withDelay(80, withTiming(1, { duration: 240 }, (fin) => {
      if (fin) runOnJS(finish)();
    }));
  };

  // Logo centre sits a little above the middle; the welcome ending glides it to login's hero.
  const heroTop = height / 2 - 60 - BOX / 2;
  const glide = insets.top + LOGIN_HERO_TOP - heroTop;

  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const auroraStyle = useAnimatedStyle(() => ({ opacity: easeOut(seg(intro.value, 0, 800)) }));
  const heroStyle = useAnimatedStyle(() => {
    if (modeSV.value === WELCOME) {
      return { transform: [{ translateY: glide * easeInOut(seg(stage.value, 1050, 1500)) }, { scale: 1 }] };
    }
    return { transform: [{ translateY: 0 }, { scale: 1 + 0.1 * exit.value * exit.value }] };
  });
  const haloStyle = useAnimatedStyle(() => ({
    // Same breathing as login's halo (0.5–0.9 opacity, 0.92–1.08 scale, 2.8 s).
    opacity: seg(intro.value, 250, 900) * (0.5 + 0.4 * breathe.value),
    transform: [{ scale: 0.92 + 0.16 * breathe.value }],
  }));
  const markStyle = useAnimatedStyle(() => {
    const ip = easeOut(seg(intro.value, 0, T.intro));
    let rot = -90 * (1 - ip);
    let scale = S_INTRO * (0.86 + 0.14 * ip);
    if (modeSV.value === WELCOME) {
      rot += land.value * easeInOut(seg(stage.value, 0, 1100)) + (exit.value * T.exit * 360) / LOGIN_SPIN_MS;
      scale += (S_LOGIN - S_INTRO) * easeInOut(seg(stage.value, 950, 1450));
    } else if (modeSV.value === RETURNING) {
      rot += 100 * easeOut(seg(stage.value, 0, T.returning)) + 25 * exit.value;
      scale += (S_RETURN - S_INTRO) * backOut(seg(stage.value, 0, 560));
    }
    return { transform: [{ rotate: `${rot}deg` }, { scale }] };
  });
  const hubStyle = useAnimatedStyle(() => ({ transform: [{ scale: backOut(seg(intro.value, 520, 820)) }] }));
  const tagStyle = useRise(stage, 520, 900, 8);
  const eyebrowStyle = useRise(stage, 680, 1060, 6);
  const greetStyle = useRise(stage, 260, 620);
  const nameStyle = useRise(stage, 340, 720, 14);
  const barWrapStyle = useRise(stage, 480, 820, 6);
  const barFillStyle = useAnimatedStyle(() => ({ width: 132 * easeInOut(seg(stage.value, 480, T.returning)) }));

  const first = firstNameOf(user?.name);
  const greeting = greetingFor(new Date().getHours());

  return (
    <Animated.View
      pointerEvents={leaving ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.ink, zIndex: 1000, elevation: 1000 }, rootStyle]}
    >
      <StatusBar style="light" />
      <Animated.View style={[StyleSheet.absoluteFill, auroraStyle]} pointerEvents="none">
        <SplashAurora width={width} height={height} />
      </Animated.View>
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityRole="button" accessibilityLabel="Skip intro" />

      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: heroTop, alignItems: 'center' }, heroStyle]}>
        {/* Logo box — the same 104 px box as the login hero, everything centred on it. */}
        <View style={{ width: BOX, height: BOX }}>
          <Animated.View style={[{ position: 'absolute', left: (BOX - HALO) / 2, top: (BOX - HALO) / 2 }, haloStyle]}>
            <SplashHalo />
          </Animated.View>
          <Ripple index={0} ripple={ripple} />
          <Ripple index={1} ripple={ripple} />
          <Animated.View style={[{ position: 'absolute', left: (BOX - MARK) / 2, top: (BOX - MARK) / 2, width: MARK, height: MARK }, markStyle]}>
            {BLADES.map((c, i) => <Blade key={i} index={i} color={c} intro={intro} />)}
            <Animated.View
              style={[{
                position: 'absolute', left: (MARK - HUB) / 2, top: (MARK - HUB) / 2, width: HUB, height: HUB,
                borderRadius: HUB / 2, backgroundColor: colors.ink,
              }, hubStyle]}
            />
          </Animated.View>
        </View>

        {mode === 'welcome' ? (
          <>
            <View style={{ flexDirection: 'row', marginTop: 2 }}>
              {WORD.map((ch, i) => <Letter key={i} ch={ch} index={i} stage={stage} />)}
            </View>
            <Animated.Text style={[{ color: colors.cream, fontSize: 15, fontWeight: '700', letterSpacing: 0.4, marginTop: 4 }, tagStyle]}>
              Smart Connect
            </Animated.Text>
            <Animated.Text style={[{ color: colors.textMuted2, fontSize: 9.5, fontWeight: '700', letterSpacing: 3, marginTop: 12 }, eyebrowStyle]}>
              THE BUSINESS ENGINE
            </Animated.Text>
          </>
        ) : null}

        {mode === 'returning' ? (
          // The mark settles at RETURN_SIZE — past the box on each side — so the copy starts below it.
          <View style={{ alignItems: 'center', marginTop: (RETURN_SIZE - BOX) / 2 + 22, paddingHorizontal: 24 }}>
            <Animated.Text style={[{ color: colors.cream, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 }, greetStyle]}>
              {first ? `${greeting},` : greeting}
            </Animated.Text>
            {first ? (
              <Animated.Text numberOfLines={1}
                style={[{ color: colors.paper, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 2, maxWidth: width - 48 }, nameStyle]}>
                {first}
              </Animated.Text>
            ) : null}
            <Animated.View style={[{ alignItems: 'center', marginTop: 22 }, barWrapStyle]}>
              <View style={{ width: 132, height: 3, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' }}>
                <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: colors.accent }, barFillStyle]} />
              </View>
              <Text style={{ color: colors.textMuted2, fontSize: 10, fontWeight: '700', letterSpacing: 1.6, marginTop: 10 }}>
                OPENING YOUR WORKSPACE
              </Text>
            </Animated.View>
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
