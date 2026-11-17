import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useRouter } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { TwoPane } from './TwoPane';
import { useWideLayout } from '../../hooks/useWideLayout';
import { useChatPaneStore } from '../../store/chatPaneStore';
import { useChatListPalette, type ChatListPalette } from '../../theme';
import { textStyles } from '../../theme/typography';
// The chat screen's thread, embedded in the right pane. Not in the components barrel: the chat screen
// imports that barrel, and this file must stay out of the cycle.
import { ChatThread } from '../../../app/chat/[id]';

// Every screen that lists chats — the Chats tab, Archived, Search, Starred — opens
// a chat the same way: beside the list on a wide window (the iPhone Duo opened), as its own screen on
// a phone-width one. They used to push the chat screen whatever the width, so a chat opened from
// Archived or Search took over the whole opened Duo (owner, 2026-11-17: "it should open in right
// window"). ONE open chat is shared by all of them (chatPaneStore): going back from Archived to the
// Chats tab keeps the chat it opened on the right, as WhatsApp does.

export interface OpenChatOptions {
  /** A message to land on (a search hit, a starred message). */
  messageId?: string | null;
  /** Phone width: replace this screen with the chat instead of pushing it (Search → new chat). */
  replace?: boolean;
}

/** Open a chat from a list: in the right pane when the window is wide, as its own screen otherwise. */
export function useOpenChat(): (id: string, opts?: OpenChatOptions) => void {
  const wide = useWideLayout();
  const router = useRouter();
  return useCallback((id: string, opts: OpenChatOptions = {}) => {
    const messageId = opts.messageId ?? null;
    if (wide) { useChatPaneStore.getState().open(id, messageId); return; }
    const route = { pathname: '/chat/[id]' as const, params: messageId ? { id, messageId } : { id } };
    if (opts.replace) router.replace(route);
    else router.push(route);
  }, [wide, router]);
}

/** The right pane's panel while no chat is open in it. */
export interface PaneEmptyContent {
  title: string;
  text: string;
  /** A button on the panel — a task page's "Open chat". */
  action?: { label: string; onPress: () => void } | null;
}

const PICK_A_CHAT: PaneEmptyContent = { title: 'Pick a chat', text: 'It opens here, beside your list.' };

/**
 * A chat list with the open chat beside it. Phone width: the list alone. Wide: the list on the left
 * and the open chat on the right, split on the fold (TwoPane), or a "Pick a chat" panel until one is
 * picked.
 *
 * `only` scopes the right pane to one chat — a task page shows ITS chat there, never whichever chat
 * was last opened on the Chats tab. `null`: the screen has no chat (yet), so the panel stays.
 */
export function ChatSplit({ list, only, empty = PICK_A_CHAT }: {
  list: ReactNode;
  only?: string | null;
  empty?: PaneEmptyContent;
}) {
  const p = useChatListPalette();
  const wide = useWideLayout();
  const router = useRouter();
  const focused = useIsFocused();
  const paneId = useChatPaneStore((s) => s.openId);
  const paneMessageId = useChatPaneStore((s) => s.messageId);

  // Folding the phone shuts the right pane — carry the open chat over as its own screen, so the
  // conversation the user was in is still in front of them on the small screen. Only the screen in
  // front does it: the Chats tab stays mounted under Archived and Search, and must not close the
  // pane before the screen on top has carried its chat over.
  const wasWide = useRef(wide);
  useEffect(() => {
    if (wasWide.current && !wide && focused) {
      const { openId, messageId } = useChatPaneStore.getState();
      useChatPaneStore.getState().close();
      if (openId) router.push({ pathname: '/chat/[id]', params: messageId ? { id: openId, messageId } : { id: openId } });
    }
    wasWide.current = wide;
  }, [wide, focused, router]);

  if (!wide) return <>{list}</>;
  // The open chat is mounted only while this screen is in front: it marks the chat read and holds it
  // as "active" (no notification for it) for as long as it is mounted, which must not outlive the
  // user looking at it. Keyed on the chat AND the message to land on — each chat reads its
  // draft/unread state once, at mount, and a second search hit in the same chat must jump again.
  return (
    <TwoPane background={p.bar} divider={p.line} grip={p.mute} accent={p.accent} left={list} right={
      paneId && focused && (only === undefined || paneId === only)
        ? <ChatThread key={`${paneId}:${paneMessageId ?? ''}`} id={paneId} messageId={paneMessageId} embedded onClose={() => useChatPaneStore.getState().close()} />
        : <PaneEmpty p={p} content={empty} />
    } />
  );
}

// The right pane before a chat is picked (WhatsApp's wide-layout welcome panel).
function PaneEmpty({ p, content }: { p: ChatListPalette; content: PaneEmptyContent }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: p.list, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: p.rowUnread, alignItems: 'center', justifyContent: 'center' }}>
        <MessageCircle size={44} color={p.accent} />
      </View>
      <Text style={{ color: p.text, ...textStyles.title3, marginTop: 18, textAlign: 'center' }}>{content.title}</Text>
      <Text style={{ color: p.mute, ...textStyles.subheadline, marginTop: 6, textAlign: 'center' }}>{content.text}</Text>
      {content.action ? (
        <Pressable onPress={content.action.onPress} accessibilityRole="button" hitSlop={4}
          style={{ marginTop: 20, height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: p.onAccent, ...textStyles.headline }}>{content.action.label}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}
