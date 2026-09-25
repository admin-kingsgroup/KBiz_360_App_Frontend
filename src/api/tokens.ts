// In-memory JWT holder for the API layer. The app may persist these to expo-secure-store at the edge
// (kept out of the core so the client stays pure + unit-testable). Access token is read by `client`.
interface TokenState {
  access: string | null;
  refresh: string | null;
}

const state: TokenState = { access: null, refresh: null };

export const getAccessToken = (): string | null => state.access;
export const getRefreshToken = (): string | null => state.refresh;

export const setTokens = (access: string | null, refresh: string | null): void => {
  state.access = access;
  state.refresh = refresh;
};

export const clearTokens = (): void => {
  state.access = null;
  state.refresh = null;
};
