// Pure notification → route mapping. No native imports, so it is unit-testable.
export type NotifType = 'reminder' | 'chat' | 'alert' | 'attendance' | 'call' | 'email';
export interface NotifData { type?: NotifType; id?: string }

export function routeForData(data: NotifData): { pathname: string; params?: Record<string, string> } {
  switch (data.type) {
    case 'chat': return { pathname: '/chat/[id]', params: { id: data.id ?? '' } };
    case 'alert': return { pathname: '/alert/[id]', params: { id: data.id ?? '' } };
    case 'attendance': return { pathname: '/attendance' };
    case 'reminder': return { pathname: '/(tabs)/reminders' };
    // Incoming-call push (app was killed): open the Calls tab. If the call is still ringing, the
    // socket's call:incoming event raises the global IncomingCallOverlay once the socket reconnects.
    case 'call': return { pathname: '/(tabs)/call' };
    case 'email': return { pathname: '/(tabs)/email' };
    default: return { pathname: '/(tabs)' };
  }
}
