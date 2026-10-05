import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getLiveLocations, getLocationTrail, type LivePerson, type TrailDay } from '../../src/api/location';
import { buildTrailMapHtml } from '../../src/logic/trailMap';
import { liveStatus, trailDistanceMeters, distanceText, shiftDayKey } from '../../src/logic/locationTrail';
import { ApiError } from '../../src/api/client';

// Admin → Live location → map. Two modes off one route:
//   ?userId=…  one person's trail for a business day (‹ › steps through past days);
//   no userId  everyone's latest position today on one map.
// The map is a WebView (Leaflet + OpenStreetMap) — the app ships no native map module.

const fmtT = (iso: string | null): string => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—');
const fmtD = (key: string): string => new Date(`${key}T00:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const REFRESH_MS = 30_000;

export default function LocationTrailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string; name?: string }>();
  const userId = typeof params.userId === 'string' && params.userId ? params.userId : null;

  const [date, setDate] = useState<string | undefined>(undefined); // undefined = today (server's business day)
  const [trail, setTrail] = useState<TrailDay | null>(null);
  const [people, setPeople] = useState<LivePerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<string | null>(null); // the server's "today", learnt from the first load

  const load = useCallback(async (): Promise<void> => {
    try {
      if (userId) {
        const t = await getLocationTrail(userId, date);
        setTrail(t);
        if (date === undefined) setToday(t.date);
      } else {
        setPeople(await getLiveLocations());
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load — check your connection');
    } finally {
      setLoading(false);
    }
  }, [userId, date]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Keep a LIVE view moving; a past day never changes.
    const isLive = !userId || date === undefined;
    if (!isLive) return undefined;
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load, userId, date]);

  const html = useMemo(() => {
    if (userId) {
      if (!trail) return null;
      return buildTrailMapHtml({ points: trail.points, offices: trail.offices, live: trail.tracking });
    }
    if (!people) return null;
    const now = Date.now();
    return buildTrailMapHtml({
      people: people.filter((p) => p.last?.today).map((p) => ({
        name: p.name, lat: p.last!.lat, lng: p.last!.lng, at: p.last!.at, accuracy: p.last!.accuracy, color: p.color,
        live: liveStatus(p, now).tone === 'live',
      })),
    });
  }, [userId, trail, people]);

  const shown = trail?.date ?? date ?? today;
  const canNext = !!shown && !!today && shown < today;
  const step = (n: number): void => {
    if (!shown) return;
    const next = shiftDayKey(shown, n);
    if (today && next >= today) setDate(undefined); else setDate(next);
  };

  const title = userId ? (trail?.name ?? params.name ?? 'Trail') : 'Everyone · now';
  const points = trail?.points ?? [];
  const sub = userId
    ? (trail ? `${trail.branch !== '—' ? `${trail.branch} · ` : ''}in ${fmtT(trail.checkInAt)} · out ${trail.checkOutAt ? fmtT(trail.checkOutAt) : (trail.checkInAt ? 'still in' : '—')}` : ' ')
    : (people ? `${people.filter((p) => p.last?.today).length} of ${people.length} located today` : ' ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ height: 56, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.coolDivider }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{title}</Text>
          <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{sub}</Text>
        </View>
        <Pressable onPress={() => { setLoading(true); void load(); }} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={18} color={colors.coolText} />}
        </Pressable>
      </View>

      {userId ? (
        <View className="flex-row items-center justify-between px-3" style={{ height: 48, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.coolDivider }}>
          <Pressable onPress={() => step(-1)} disabled={!shown} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><ChevronLeft size={18} color={colors.ink} /></Pressable>
          <View className="items-center">
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>{shown ? (shown === today ? `Today · ${fmtD(shown)}` : fmtD(shown)) : '…'}</Text>
            <Text style={{ color: colors.coolText, fontSize: 11.5 }}>
              {trail ? (points.length ? `${points.length} points · ${distanceText(trailDistanceMeters(points))} · ${fmtT(points[0].at)}–${fmtT(points[points.length - 1].at)}` : 'No location recorded') : ' '}
            </Text>
          </View>
          <Pressable onPress={() => step(1)} disabled={!canNext} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted, opacity: canNext ? 1 : 0.35 }}><ChevronRight size={18} color={colors.ink} /></Pressable>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {error && !html ? (
          <View className="flex-1 items-center justify-center" style={{ padding: 24 }}>
            <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{error}</Text>
          </View>
        ) : !html ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://localhost/' }}
            style={{ flex: 1, backgroundColor: colors.coolMuted }}
            javaScriptEnabled
            domStorageEnabled={false}
            setSupportMultipleWindows={false}
            // The page is app-generated; it only ever needs its own document + map tiles. Any
            // navigation away (an attribution link tap) is refused so the map can't be replaced.
            onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('https://localhost/')}
          />
        )}
        {userId && trail && !points.length && !error ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 24, borderRadius: 14, backgroundColor: colors.card, padding: 14, borderWidth: 1, borderColor: colors.coolDivider }}>
            <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>No location recorded for this day</Text>
            <Text style={{ color: colors.coolText, fontSize: 12.5, lineHeight: 18, marginTop: 3 }}>
              {trail.checkInAt
                ? 'They were checked in, but their phone sent nothing — sharing not agreed yet, location turned off, or the app was force-stopped.'
                : 'They did not check in on this day. Location is shared only between check-in and check-out.'}
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
