// Pure notification → route mapping. No native imports, so it is unit-testable.
export type NotifType = 'reminder' | 'chat' | 'alert' | 'attendance' | 'email' | 'task';
export interface NotifData { type?: NotifType; id?: string; taskId?: string; chatId?: string }

export function routeForData(data: NotifData): { pathname: string; params?: Record<string, string> } {
  switch (data.type) {
    case 'chat': return { pathname: '/chat/[id]', params: { id: data.id ?? '' } };
    case 'alert': return { pathname: '/alert/[id]', params: { id: data.id ?? '' } };
    case 'attendance': return { pathname: '/attendance' };
    // Reminders became Tasks (2026-11-16); the tab kept its route name, so an old reminder push lands there.
    case 'reminder': return { pathname: '/(tabs)/reminders' };
    // A task event (assigned, done, due soon, overdue…) opens the task; its chat is one tap from there.
    // Task-chat MESSAGES arrive as ordinary chat pushes and open the chat. Without a task id (never
    // expected) the chat, then the Tasks tab, are the fallbacks.
    case 'task': {
      const taskId = data.taskId ?? data.id;
      if (taskId) return { pathname: '/task/[id]', params: { id: taskId } };
      if (data.chatId) return { pathname: '/chat/[id]', params: { id: data.chatId } };
      return { pathname: '/(tabs)/reminders' };
    }
    case 'email': return { pathname: '/(tabs)/email' };
    default: return { pathname: '/(tabs)' };
  }
}
