import { readFileSync } from 'fs';
import { join } from 'path';

// On a wide window (the iPhone Duo opened) a chat opens in the right pane, beside the list it was
// picked from — `useOpenChat` decides that, and `ChatSplit` draws the two panes. The Groups view,
// Archived, Search and Starred used to push the chat screen themselves, so a chat
// picked there took over the whole window (seen on the Duo simulator, 2026-11-17). Each list must
// open chats through the shared opener and sit in the shared split.
const root = join(__dirname, '..', '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');
const PUSHES_CHAT = /router\.(push|replace|navigate)\(\{\s*pathname:\s*['"]\/chat\/\[id\]['"]/;

describe('every chat list opens a chat beside itself on a wide window', () => {
  it.each([
    'app/(tabs)/index.tsx',
    'app/chat/archived.tsx',
    'app/chat/search.tsx',
    'app/chat/starred.tsx',
    'src/components/home/GroupsPane.tsx',
    'src/components/home/GroupsList.tsx',
    'app/task/[id].tsx',
    'app/task/chat.tsx',
    'app/task/list.tsx',
    'src/components/tasks/TasksScreen.tsx',
    'src/components/tasks/useOpenTaskChat.ts',
    'src/services/callForeground.ts',
    'src/hooks/useNotificationRouting.ts',
  ])('%s does not push the chat screen itself', (file) => {
    expect(read(file)).not.toMatch(PUSHES_CHAT);
  });

  it.each([
    'app/(tabs)/index.tsx',
    'app/chat/archived.tsx',
    'app/chat/search.tsx',
    'app/chat/starred.tsx',
  ])('%s opens chats through useOpenChat and sits in ChatSplit', (file) => {
    const src = read(file);
    expect(src).toMatch(/useOpenChat\(\)/);
    expect(src).toMatch(/<ChatSplit list=\{/);
  });

  // A task's chat — the task page's chat card and the chat icon on a task in a list (Afshin,
  // 2026-11-17) — opens through useOpenTaskChat, which starts the chat if needed and then opens it
  // through useOpenChat like any other.
  it('task chats open through useOpenTaskChat, which opens through useOpenChat', () => {
    expect(read('src/components/tasks/useOpenTaskChat.ts')).toMatch(/useOpenChat\(\)/);
    expect(read('app/task/[id].tsx')).toMatch(/useOpenTaskChat\(/);
    expect(read('app/task/[id].tsx')).toMatch(/<ChatSplit list=\{/);
    expect(read('src/components/tasks/TasksScreen.tsx')).toMatch(/useOpenTaskChat\(\{ fromList: true \}\)/);
    expect(read('app/task/list.tsx')).toMatch(/useOpenTaskChat\(\{\s*fromList: true/);
  });

  it('the Chats tab gives the Groups view its openChat and the chat open in the pane', () => {
    const tab = read('app/(tabs)/index.tsx');
    const groups = /<GroupsPane\b[^>]*>/.exec(tab)?.[0] ?? '';
    expect(groups).toMatch(/onOpenChat=\{openChat\}/);
    expect(groups).toMatch(/openId=\{/);
  });
});

// From outside the chat lists — a notification tap, a call screen — a chat opens through
// openChatFromOutside: the Chats tab's right pane on a wide window (logic/openChatRoute).
describe('notification taps open a chat beside the list on a wide window', () => {
  it.each(['src/hooks/useNotificationRouting.ts', 'src/services/callForeground.ts'])('%s uses openChatFromOutside', (file) => {
    expect(read(file)).toMatch(/openChatFromOutside\(/);
  });

  it('the task page shows only its own chat on the right', () => {
    expect(read('app/task/[id].tsx')).toMatch(/<ChatSplit list=\{page\} only=\{task\.chatId \?\? null\}/);
  });
});
