import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { colors } from '../src/theme';
import * as emailApi from '../src/api/email';
import { useEmailStore } from '../src/store/emailStore';
import { useUiStore } from '../src/store/uiStore';
import { msAuthBridge } from '../src/services/msAuthBridge';

WebBrowser.maybeCompleteAuthSession();

// Microsoft OAuth redirect target: kbiz360://email-connect?code=…
// On Android the redirect arrives here as a deep link (rather than as the auth-session result), so
// we finish the PKCE exchange using the verifier the hook stashed, then return to the mailbox.
// dedupe via msAuthBridge.shouldHandle so we never exchange the same code twice.
export default function EmailConnect() {
  const router = useRouter();
  const { code, error } = useLocalSearchParams<{ code?: string; error?: string }>();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      const verifier = msAuthBridge.verifier();
      const redirect = msAuthBridge.redirect();
      if (!error && code && verifier && redirect && msAuthBridge.shouldHandle(code)) {
        try {
          await emailApi.connect(code, verifier, redirect);
          await useEmailStore.getState().checkStatus();
          useUiStore.getState().showToast('Microsoft account connected');
        } catch {
          useUiStore.getState().showToast('Could not connect — please try again');
        }
      } else if (error) {
        useUiStore.getState().showToast('Microsoft sign-in was cancelled');
      }
      router.replace('/(tabs)/email');
    })();
  }, [code, error, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolBg }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
