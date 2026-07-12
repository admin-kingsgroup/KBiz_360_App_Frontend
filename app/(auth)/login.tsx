import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, FadeIn, FadeInDown,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { User, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react-native';
import { KBLogo } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { authApi, ApiError } from '../../src/api';

// Real authentication against the backend (CRM users via /api/auth/login). On success the auth
// store flips to signed-in and the root gate routes to permissions/app. SSO/forgot are not wired.
// The visual layer is a modern redesign: animated aurora, rotating brand mark, staggered entrance.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Soft, layered radial glows over the dark canvas — gives the screen depth without an image.
function Aurora() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="a" cx="18%" cy="8%" r="55%">
          <Stop offset="0" stopColor={colors.purple} stopOpacity="0.38" />
          <Stop offset="1" stopColor={colors.purple} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="b" cx="92%" cy="86%" r="62%">
          <Stop offset="0" stopColor={colors.blue} stopOpacity="0.30" />
          <Stop offset="1" stopColor={colors.blue} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="c" cx="88%" cy="6%" r="45%">
          <Stop offset="0" stopColor={colors.teal} stopOpacity="0.20" />
          <Stop offset="1" stopColor={colors.teal} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill={colors.ink} />
      <Rect width={width} height={height} fill="url(#a)" />
      <Rect width={width} height={height} fill="url(#b)" />
      <Rect width={width} height={height} fill="url(#c)" />
    </Svg>
  );
}

// Soft halo that sits behind the logo (radial falloff = real glow without blur).
function LogoHalo() {
  return (
    <Svg width={240} height={240}>
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.purple} stopOpacity="0.55" />
          <Stop offset="0.55" stopColor={colors.blue} stopOpacity="0.18" />
          <Stop offset="1" stopColor={colors.blue} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={120} cy={120} r={120} fill="url(#halo)" />
    </Svg>
  );
}

export default function Login() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [focused, setFocused] = useState<'id' | 'pwd' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // Continuous logo spin + a slow breathing halo.
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);
  const press = useSharedValue(1);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false);
    breathe.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [spin, breathe]);

  const logoStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.5 + breathe.value * 0.4, transform: [{ scale: 0.92 + breathe.value * 0.16 }] }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const onLogin = async () => {
    if (!userId.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authApi.login(userId.trim().toLowerCase(), password);
      // success → root gate redirects to permissions/app automatically
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };
  const fieldBorder = (f: 'id' | 'pwd') => (focused === f ? colors.purple : colors.line);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      <Aurora />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: insets.bottom + 44 }}
          bottomOffset={24} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <Animated.View entering={FadeIn.duration(800)} style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={[{ position: 'absolute' }, haloStyle]}><LogoHalo /></Animated.View>
              <Animated.View style={logoStyle}><KBLogo size={92} /></Animated.View>
            </Animated.View>

            <Animated.Text entering={FadeInDown.delay(160).duration(620)}
              style={{ fontSize: 42, color: colors.paper, letterSpacing: -1.5, fontWeight: '800', marginTop: 2 }}>KBiz 360</Animated.Text>
            <Animated.Text entering={FadeInDown.delay(240).duration(620)}
              style={{ color: colors.cream, fontSize: 15, fontWeight: '700', letterSpacing: 0.4, marginTop: 4 }}>Smart Connect</Animated.Text>
            <Animated.Text entering={FadeInDown.delay(320).duration(620)}
              style={{ color: colors.textMuted2, fontSize: 9.5, fontWeight: '700', letterSpacing: 3, marginTop: 12 }}>THE BUSINESS ENGINE</Animated.Text>
          </View>

          {/* Sign-in card */}
          <Animated.View entering={FadeInDown.delay(360).duration(700)}
            style={{ marginTop: 32, borderRadius: 26, padding: 20, backgroundColor: 'rgba(18,22,32,0.62)', borderWidth: 1, borderColor: colors.line }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: colors.paper, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>Welcome back</Text>
              <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 3 }}>Sign in to your workspace</Text>
            </View>

            {/* User ID */}
            <View className="flex-row items-center gap-2.5"
              style={{ borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(12,14,20,0.7)', borderWidth: 1, borderColor: fieldBorder('id') }}>
              <User size={17} color={focused === 'id' ? colors.purple : colors.textMuted2} />
              <TextInput value={userId} onChangeText={(t) => { setUserId(t); if (error) setError(null); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={!loading}
                onFocus={() => setFocused('id')} onBlur={() => setFocused(null)} onSubmitEditing={onLogin}
                placeholder="Email" placeholderTextColor={colors.textMuted}
                style={{ flex: 1, color: colors.paper, fontSize: 14, fontWeight: '600' }} />
            </View>

            {/* Password */}
            <View className="flex-row items-center gap-2.5" style={{ marginTop: 10, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(12,14,20,0.7)', borderWidth: 1, borderColor: fieldBorder('pwd') }}>
              <Lock size={17} color={focused === 'pwd' ? colors.purple : colors.textMuted2} />
              <TextInput value={password} onChangeText={(t) => { setPassword(t); if (error) setError(null); }} secureTextEntry={!showPwd} editable={!loading}
                onFocus={() => setFocused('pwd')} onBlur={() => setFocused(null)} onSubmitEditing={onLogin}
                placeholder="Password" placeholderTextColor={colors.textMuted}
                style={{ flex: 1, color: colors.paper, fontSize: 14, fontWeight: '600' }} />
              <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8} accessibilityLabel={showPwd ? 'Hide password' : 'Show password'}>
                {showPwd ? <EyeOff size={17} color={colors.textMuted2} /> : <Eye size={17} color={colors.textMuted2} />}
              </Pressable>
            </View>

            {/* Error */}
            {error ? (
              <Text style={{ color: colors.coral, fontSize: 11.5, fontWeight: '700', marginTop: 10 }}>{error}</Text>
            ) : null}

            {/* Sign in */}
            <AnimatedPressable onPress={onLogin} disabled={loading}
              onPressIn={() => { press.value = withTiming(0.97, { duration: 110 }); }}
              onPressOut={() => { press.value = withTiming(1, { duration: 160 }); }}
              className="flex-row items-center justify-center gap-2"
              style={[btnStyle, { marginTop: 14, borderRadius: 15, paddingVertical: 15, backgroundColor: colors.paper, opacity: loading ? 0.7 : 1 }]}>
              {loading ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <>
                  <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '800' }}>Sign in</Text>
                  <ArrowRight size={16} color={colors.ink} strokeWidth={2.6} />
                </>
              )}
            </AnimatedPressable>

          </Animated.View>

          <Text style={{ color: colors.textMuted2, fontSize: 10, textAlign: 'center', marginTop: 14 }}>v1.0 · Build 240</Text>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}
