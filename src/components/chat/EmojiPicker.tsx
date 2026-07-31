import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { Delete } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../theme';
import { EMOJI_CATEGORIES } from '../../data/emoji';

// WhatsApp-style emoji panel for the chat composer. Category tabs on top (Recent first), an
// 8-column grid below, and a backspace key. Pure JS — no native emoji-keyboard dependency, so it
// ships over OTA. Recents are persisted per device (most-recent first, capped).

const RECENTS_KEY = 'kb360-emoji-recents';
const MAX_RECENTS = 32;
const COLUMNS = 8;

let recentsCache: string[] | null = null; // per-process cache so reopening the panel is instant

async function loadRecents(): Promise<string[]> {
  if (recentsCache) return recentsCache;
  try {
    recentsCache = JSON.parse((await AsyncStorage.getItem(RECENTS_KEY)) ?? '[]') as string[];
  } catch {
    recentsCache = [];
  }
  return recentsCache;
}

function pushRecent(emoji: string): string[] {
  const next = [emoji, ...(recentsCache ?? []).filter((e) => e !== emoji)].slice(0, MAX_RECENTS);
  recentsCache = next;
  void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}

export const EmojiPicker = memo(function EmojiPicker({ onPick, onBackspace }: { onPick: (emoji: string) => void; onBackspace: () => void }) {
  const [tab, setTab] = useState(EMOJI_CATEGORIES[0].key);
  const [recents, setRecents] = useState<string[]>(recentsCache ?? []);
  useEffect(() => { void loadRecents().then(setRecents); }, []);

  const showRecent = recents.length > 0;
  const activeTab = showRecent || tab !== 'recent' ? tab : EMOJI_CATEGORIES[0].key;
  const emojis = useMemo(
    () => (activeTab === 'recent' ? recents : EMOJI_CATEGORIES.find((c) => c.key === activeTab)?.emojis ?? []),
    [activeTab, recents],
  );

  const pick = useCallback((e: string) => { setRecents(pushRecent(e)); onPick(e); }, [onPick]);
  const renderItem = useCallback(({ item }: { item: string }) => (
    <Pressable onPress={() => pick(item)} style={{ flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 26 }}>{item}</Text>
    </Pressable>
  ), [pick]);

  return (
    <View style={{ height: 300, backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: 1 }}>
      {/* Category tabs — Recent first when it has anything, then the static categories. */}
      <View className="flex-row items-center" style={{ paddingHorizontal: 6, paddingVertical: 4, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        {showRecent ? (
          <Pressable onPress={() => setTab('recent')} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: activeTab === 'recent' ? colors.coolMuted : 'transparent' }}>
            <Text style={{ fontSize: 18 }}>🕒</Text>
          </Pressable>
        ) : null}
        {EMOJI_CATEGORIES.map((c) => (
          <Pressable key={c.key} onPress={() => setTab(c.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: activeTab === c.key ? colors.coolMuted : 'transparent' }}>
            <Text style={{ fontSize: 18 }}>{c.icon}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onBackspace} hitSlop={6} style={{ width: 40, alignItems: 'center', paddingVertical: 6 }}>
          <Delete size={20} color={colors.coolText} />
        </Pressable>
      </View>
      <FlatList
        key={activeTab} // reset scroll when switching categories
        data={emojis}
        keyExtractor={(item, i) => `${item}-${i}`}
        renderItem={renderItem}
        numColumns={COLUMNS}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6 }}
        initialNumToRender={48}
        windowSize={5}
      />
    </View>
  );
});
