import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, Linking, StyleSheet } from 'react-native';
import { colors } from '../../theme';
import { firstLink } from '../../logic/linkify';
import { getLinkPreview, type LinkPreview } from '../../api/chat';

// The card WhatsApp draws under a pasted link: site, headline, blurb and thumbnail. The metadata is
// fetched by OUR server, never by the phone — otherwise every reader's IP would be handed to whatever
// was linked. Failures render nothing at all; a missing card is not worth an error state.
//
// Results are memoised per URL for the session, so one link in a busy group is fetched once.
const cache = new Map<string, LinkPreview | null>();
const inFlight = new Map<string, Promise<LinkPreview | null>>();

function load(url: string): Promise<LinkPreview | null> {
  const hit = inFlight.get(url);
  if (hit) return hit;
  const p = getLinkPreview(url).catch(() => null).then((v) => { cache.set(url, v); inFlight.delete(url); return v; });
  inFlight.set(url, p);
  return p;
}

export function LinkPreviewCard({ text }: { text: string }) {
  const url = firstLink(text);
  const [preview, setPreview] = useState<LinkPreview | null>(() => (url ? cache.get(url) ?? null : null));

  useEffect(() => {
    if (!url || cache.has(url)) return;
    let alive = true;
    void load(url).then((v) => { if (alive) setPreview(v); });
    return () => { alive = false; };
  }, [url]);

  if (!url || !preview || (!preview.title && !preview.image)) return null;

  return (
    <Pressable
      onPress={() => void Linking.openURL(preview.url).catch(() => undefined)}
      style={{ marginHorizontal: 4, marginBottom: 5, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.coolMuted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.coolDivider }}
    >
      {preview.image ? (
        <Image source={{ uri: preview.image }} style={{ width: '100%', height: 130 }} resizeMode="cover" />
      ) : null}
      <View style={{ padding: 8, gap: 2 }}>
        {preview.siteName ? (
          <Text numberOfLines={1} style={{ color: colors.coolText3, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' }}>{preview.siteName}</Text>
        ) : null}
        {preview.title ? (
          <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 13.5, fontWeight: '600', lineHeight: 18 }}>{preview.title}</Text>
        ) : null}
        {preview.description ? (
          <Text numberOfLines={2} style={{ color: colors.coolText, fontSize: 12, lineHeight: 16 }}>{preview.description}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
