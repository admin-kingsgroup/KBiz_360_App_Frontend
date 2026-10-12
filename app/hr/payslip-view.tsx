import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { ChevronLeft, RotateCw } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { getPayslipLink } from '../../src/api/hr';
import { isWebUrl, linkIsFresh, payslipErrorText, payslipTitle, payslipWebViewAllows } from '../../src/logic/payslip';

// One month's payslip — Books' OWN page (the Salary Register's print, owner 2026-10-12), opened from
// a 15-minute signed link the HR backend hands out for a RELEASED month only. My Payslip passes the
// link it just fetched; Retry (or a link that has gone stale) asks for a fresh one. The WebView stays
// on the payslip's own site and keeps nothing on disk once closed.

type Params = { month?: string; label?: string; url?: string; expiresAt?: string };
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export default function PayslipViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const month = one(params.month);
  const passedUrl = one(params.url);
  const [title, setTitle] = useState(() => payslipTitle({ month, label: one(params.label) }));
  // The link My Payslip just fetched — only while it is still good.
  const [url, setUrl] = useState<string | null>(() => (isWebUrl(passedUrl) && linkIsFresh(one(params.expiresAt)) ? passedUrl : null));
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const fetchLink = useCallback((): void => {
    if (!month) { setError('Open the payslip again from My Payslip.'); return; }
    setFetching(true);
    setError(null);
    setUrl(null);
    getPayslipLink(month)
      .then((link) => {
        if (!alive.current) return;
        if (!isWebUrl(link.url)) { setError('HR sent no payslip link. Please try again.'); return; }
        if (link.label) setTitle(payslipTitle({ month, label: link.label }));
        setUrl(link.url);
        setReloadKey((k) => k + 1);
      })
      .catch((e: unknown) => { if (alive.current) setError(payslipErrorText(e)); })
      .finally(() => { if (alive.current) setFetching(false); });
  }, [month]);

  // No (fresh) link handed over — ask for one.
  const asked = useRef(false);
  useEffect(() => {
    if (url || asked.current) return;
    asked.current = true;
    fetchLink();
  }, [url, fetchLink]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 56, paddingVertical: 6, borderBottomColor: colors.coolDivider, borderBottomWidth: 1, backgroundColor: colors.card }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <View className="flex-1">
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: colors.coolText, fontSize: 12 }}>Payslip</Text>
        </View>
        <Pressable onPress={fetchLink} disabled={fetching} accessibilityRole="button" accessibilityLabel="Reload payslip" hitSlop={8}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: fetching ? 0.4 : 1 }}>
          <RotateCw size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {error ? (
          <View className="items-center justify-center" style={{ flex: 1, paddingHorizontal: 28 }}>
            <Text style={{ color: colors.coolText, fontSize: 13.5, textAlign: 'center', marginBottom: 14 }}>{error}</Text>
            <Pressable onPress={fetchLink} disabled={fetching} accessibilityRole="button"
              style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary, opacity: fetching ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{fetching ? 'Trying…' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : url ? (
          <WebView
            key={`${reloadKey}`}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: '#fff' }}
            // '*' so RNW's own whitelist never hands a URL to the system browser; the handler below
            // is the real gate: only the payslip's own site (and blank/data pages) may load.
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={(req) => payslipWebViewAllows(req.url, url)}
            // A salary is private: no disk cache (iOS: a non-persistent data store), no files, no popups.
            cacheEnabled={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            javaScriptCanOpenWindowsAutomatically={false}
            setSupportMultipleWindows={false}
            // Pinch-zoom on the A4 page (Android needs the built-in zoom, minus its buttons).
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            startInLoadingState
            renderLoading={() => (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
            onError={() => setError('Couldn’t open the payslip. Check your connection and try again.')}
            onHttpError={(e) => { if (e.nativeEvent.statusCode >= 400) setError('Couldn’t open the payslip. Please try again.'); }}
            onRenderProcessGone={() => setError('The payslip view stopped. Please try again.')}
            onContentProcessDidTerminate={() => setReloadKey((k) => k + 1)}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
