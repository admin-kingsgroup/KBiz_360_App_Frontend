// Bridges the Microsoft OAuth code exchange between the auth-session hook (useMicrosoftEmail) and
// the redirect route (app/email-connect). The redirect (kbiz360://email-connect?code=…) can be
// delivered EITHER as the auth-session result (iOS) OR as an expo-router deep link (Android) — so
// both paths try to exchange, and `shouldHandle` ensures the code is exchanged exactly once.
let pendingVerifier: string | null = null;
let pendingRedirect: string | null = null;
let lastHandledCode: string | null = null;

export const msAuthBridge = {
  setPending(verifier: string, redirectUri: string): void {
    pendingVerifier = verifier;
    pendingRedirect = redirectUri;
  },
  verifier: (): string | null => pendingVerifier,
  redirect: (): string | null => pendingRedirect,
  // Returns true once per unique code (the first caller wins; the other no-ops).
  shouldHandle(code: string): boolean {
    if (!code || lastHandledCode === code) return false;
    lastHandledCode = code;
    return true;
  },
};
