import { View, Text, Pressable, ScrollView, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Check, RotateCcw } from 'lucide-react-native';
import { colors } from '../../src/theme';
import { CHAT_THEMES, chatThemeFor, DEFAULT_CHAT_THEME, type ChatTheme } from '../../src/theme/chatThemes';
import { ChatWatermark } from '../../src/components/chat';
import { useMessagingStore } from '../../src/store/messagingStore';
import { useUiStore } from '../../src/store/uiStore';

// Chat theme picker. Serves two callers with one screen:
//   /chat/theme            -> sets the GLOBAL theme (from Profile)
//   /chat/theme?conv=<id>  -> sets that one conversation's override (from the chat menu)
// The per-chat mode gains a "Use my default" tile, which clears the override rather than storing
// another key — otherwise there would be no way back to following the global choice.

export default function ChatThemePicker() {
  const router = useRouter();
  const { conv } = useLocalSearchParams<{ conv?: string }>();
  const convId = typeof conv === 'string' && conv ? conv : null;

  const globalKey = useMessagingStore((s) => s.chatTheme);
  const override = useMessagingStore((s) => (convId ? s.wallpapers[convId] : undefined));
  const watermark = useMessagingStore((s) => s.chatWatermark);
  const overrideCount = useMessagingStore((s) => Object.keys(s.wallpapers).length);
  const showToast = useUiStore((s) => s.showToast);

  // What the preview paints, and which tile reads as selected.
  const selectedKey = convId ? (override ?? null) : (globalKey ?? DEFAULT_CHAT_THEME);
  const preview = chatThemeFor(convId ? (override ?? globalKey) : globalKey);

  const pick = (t: ChatTheme): void => {
    if (convId) {
      useMessagingStore.getState().setWallpaper(convId, t.key);
      showToast(`${t.label} applied to this chat`);
    } else {
      useMessagingStore.getState().setChatTheme(t.key);
      showToast(`${t.label} applied to all chats`);
    }
  };

  const useDefault = (): void => {
    if (!convId) return;
    useMessagingStore.getState().setWallpaper(convId, null);
    showToast('Using your default theme');
  };

  const resetOverrides = (): void => {
    useMessagingStore.getState().clearThemeOverrides();
    showToast(`${overrideCount} chat${overrideCount === 1 ? '' : 's'} reset`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      <View className="flex-row items-center gap-2 px-2" style={{ backgroundColor: colors.card, height: 56, borderBottomColor: colors.coolDivider, borderBottomWidth: StyleSheet.hairlineWidth }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back"
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>Chat theme</Text>
          <Text style={{ color: colors.coolText, fontSize: 11.5 }}>
            {convId ? 'Applies to this chat only' : 'Applies to all chats'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {/* Live preview — the real bubbles on the real canvas, so the choice is made on the thing
            itself rather than on a swatch. */}
        <View style={{ backgroundColor: preview.canvas, paddingHorizontal: 14, paddingVertical: 16, overflow: 'hidden' }}>
          {watermark ? <ChatWatermark theme={preview} size={92} /> : null}
          <View style={{ alignSelf: 'flex-start', maxWidth: '84%', backgroundColor: preview.them, borderColor: preview.themBorder, borderWidth: preview.bubbleBorderWidth ?? StyleSheet.hairlineWidth, borderRadius: 16, borderBottomLeftRadius: 5, paddingHorizontal: 11, paddingVertical: 8 }}>
            <Text style={{ color: preview.senderName, fontSize: 11.5, fontWeight: '700', marginBottom: 1 }}>Anubhav Maurya</Text>
            <Text style={{ color: preview.themText, fontSize: 14.5, lineHeight: 20 }}>Sales register for BOM is ready</Text>
            <Text style={{ color: preview.thMute, fontSize: 10.5, alignSelf: 'flex-end', marginTop: 2 }}>10:42</Text>
          </View>
          <View style={{ alignSelf: 'flex-end', maxWidth: '84%', marginTop: 8, backgroundColor: preview.mine, borderColor: preview.mineBorder, borderWidth: preview.bubbleBorderWidth ?? StyleSheet.hairlineWidth, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 11, paddingVertical: 8 }}>
            <Text style={{ color: preview.meText, fontSize: 14.5, lineHeight: 20 }}>Checked — GSTR-1 ties out</Text>
            <View className="flex-row items-center gap-1" style={{ alignSelf: 'flex-end', marginTop: 2 }}>
              <Text style={{ color: preview.meMute, fontSize: 10.5 }}>10:44</Text>
              <Check size={12} color={preview.tick} />
            </View>
          </View>
        </View>

        <View className="flex-row flex-wrap" style={{ gap: 14, padding: 16 }}>
          {convId ? (
            <Tile label="Use my default" selected={selectedKey === null} onPress={useDefault}
              theme={chatThemeFor(globalKey)} muted />
          ) : null}
          {CHAT_THEMES.map((t) => (
            <Tile key={t.key} label={t.label} theme={t} selected={selectedKey === t.key} onPress={() => pick(t)} />
          ))}
        </View>

        <Row>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>KBiz 360 watermark</Text>
            <Text style={{ color: colors.coolText, fontSize: 11.5, marginTop: 1 }}>
              {watermark ? 'Brand mark behind every chat' : 'Off — plain canvas'}
            </Text>
          </View>
          <Switch value={watermark} onValueChange={(v) => useMessagingStore.getState().setChatWatermark(v)}
            trackColor={{ true: colors.primary, false: colors.coolDivider }} thumbColor="#fff" />
        </Row>

        {/* Only worth showing when there is something to reset — and never in per-chat mode, where
            the "Use my default" tile already covers this one conversation. */}
        {!convId && overrideCount > 0 ? (
          <Pressable onPress={resetOverrides} accessibilityRole="button">
            <Row>
              <RotateCcw size={18} color={colors.coolText} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 14.5, fontWeight: '600' }}>Reset per-chat themes</Text>
                <Text style={{ color: colors.coolText, fontSize: 11.5, marginTop: 1 }}>
                  {overrideCount} chat{overrideCount === 1 ? '' : 's'} {overrideCount === 1 ? 'has' : 'have'} their own
                </Text>
              </View>
            </Row>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 px-4"
      style={{ minHeight: 60, backgroundColor: colors.card, borderTopColor: colors.coolDivider, borderTopWidth: StyleSheet.hairlineWidth }}>
      {children}
    </View>
  );
}

// A theme tile: the canvas with both bubbles on it, which is the smallest honest preview — a single
// swatch cannot show that the two bubbles differ, and that is the whole point of these palettes.
function Tile({ theme, label, selected, onPress, muted }: {
  theme: ChatTheme; label: string; selected: boolean; onPress: () => void; muted?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={label} style={{ width: 96, gap: 6 }}>
      <View style={{ height: 76, borderRadius: 14, backgroundColor: theme.canvas, padding: 8, justifyContent: 'flex-end', gap: 5, opacity: muted ? 0.55 : 1, borderWidth: selected ? 2.5 : StyleSheet.hairlineWidth, borderColor: selected ? colors.primary : colors.coolDivider }}>
        <View style={{ alignSelf: 'flex-start', width: '72%', height: 18, borderRadius: 7, backgroundColor: theme.them, borderWidth: theme.bubbleBorderWidth ?? StyleSheet.hairlineWidth, borderColor: theme.themBorder }} />
        <View style={{ alignSelf: 'flex-end', width: '72%', height: 18, borderRadius: 7, backgroundColor: theme.mine, borderWidth: theme.bubbleBorderWidth ?? StyleSheet.hairlineWidth, borderColor: theme.mineBorder }} />
      </View>
      <Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.coolText, fontSize: 11.5, fontWeight: selected ? '700' : '500', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}
