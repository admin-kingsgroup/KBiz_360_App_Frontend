import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as emailApi from '../api/email';
import { useEmailStore } from '../store/emailStore';
import { useUiStore } from '../store/uiStore';
import { msAuthBridge } from '../services/msAuthBridge';

WebBrowser.maybeCompleteAuthSession();

const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send'];

// Drives the Microsoft sign-in (delegated, PKCE). The app only ever handles the short-lived auth
// CODE — it posts it to the backend, which exchanges + stores the tokens. Reads the client/tenant
// from app.json → extra.msEmail (filled in once IT provides the Azure app registration IDs).
export function useMicrosoftEmail() {
  const extra = (Constants.expoConfig?.extra as { msEmail?: { clientId?: string; tenantId?: string } } | undefined)?.msEmail;
  const clientId = extra?.clientId ?? '';
  const tenantId = extra?.tenantId || 'common';
  const discovery = AuthSession.useAutoDiscovery(`https://login.microsoftonline.com/${tenantId}/v2.0`);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'kbiz360', path: 'email-connect' });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId, scopes: SCOPES, redirectUri, usePKCE: true, responseType: AuthSession.ResponseType.Code },
    discovery,
  );
  const [connecting, setConnecting] = useState(false);

  // TEMP DIAGNOSTICS — remove once email connect is confirmed working.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[ms-email] redirectUri=', redirectUri, '| clientId?', !!clientId, '| tenant=', tenantId, '| discovery?', !!discovery, '| request?', !!request);
  }, [redirectUri, clientId, tenantId, discovery, request]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    if (response) console.log('[ms-email] response.type=', response.type, '| params=', JSON.stringify((response as { params?: unknown }).params ?? {}));
    if (response?.type === 'success' && request?.codeVerifier && response.params.code && msAuthBridge.shouldHandle(response.params.code)) {
      setConnecting(true);
      emailApi
        .connect(response.params.code, request.codeVerifier, redirectUri)
        .then(() => useEmailStore.getState().checkStatus())
        .then(() => useUiStore.getState().showToast('Microsoft account connected'))
        .catch(() => useUiStore.getState().showToast('Could not connect — please try again'))
        .finally(() => setConnecting(false));
    } else if (response?.type === 'error') {
      useUiStore.getState().showToast('Microsoft sign-in failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return {
    configured: !!clientId, // false until the Azure client ID is set in app.json
    ready: !!request,
    connecting,
    // Stash the PKCE verifier so the redirect route (app/email-connect) can also finish the exchange
    // if Android delivers the redirect as a deep link instead of an auth-session result.
    connect: () => {
      // eslint-disable-next-line no-console
      console.log('[ms-email] connect tapped — request?', !!request, '| redirectUri=', redirectUri);
      if (request?.codeVerifier) msAuthBridge.setPending(request.codeVerifier, redirectUri);
      if (request) void promptAsync();
    },
  };
}
