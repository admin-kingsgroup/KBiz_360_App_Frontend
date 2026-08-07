import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { Download, FileText, Play } from 'lucide-react-native';
import { colors } from '../../theme';
import { useUiStore } from '../../store/uiStore';
import { mediaUrl, humanSize } from '../../api/media';
import type { ChatAttachment, ChatMessage } from '../../api/chat';
import { downloadedUri, downloadAttachment, saveMediaToDevice, attachmentMime, exportToSharedFolder } from '../../services/attachments';

// WhatsApp-style download-gated attachment (photo / video / document) inside a chat bubble.
// Received attachments start as a preview (blurred photo / thumbnail / file row) with a download
// button showing the size; tapping downloads to the app's media dir — photos & videos are ALSO
// saved to the device gallery — and only then does tapping open the file. The sender's own
// attachments are never gated (they sent the file), but still open from the local copy once cached.
// Media tiles size off the SCREEN, never a fixed pixel width. The bubble around them is capped at
// 80% of the row and also gives up a lane to the quick-forward arrow plus its own padding, so on a
// narrow display (a foldable's cover screen, a small phone) a rigid tile ends up wider than the card
// containing it and spills over the rounded edge. 52% of the window sits inside the bubble's content
// box on every size we support; the cap keeps tiles from ballooning on tablets and unfolded screens.
const TILE_MAX = 210;
const TILE_MIN = 150;
const tileWidth = (screenW: number): number => Math.max(TILE_MIN, Math.min(TILE_MAX, Math.round(screenW * 0.52)));
const OVERLAY = 'rgba(15,20,24,0.45)';

export function AttachmentTile({ att, type, mine, onOpenImage, onOpenFile, onLongPress }: {
  att: ChatAttachment;
  type: ChatMessage['type'];
  mine: boolean;
  onOpenImage: (uri: string) => void;
  onOpenFile: (file: { uri: string; name: string; mime: string }) => void;
  onLongPress?: () => void;
}) {
  const showToast = useUiStore((s) => s.showToast);
  const { width: screenW } = useWindowDimensions();
  const TILE_W = tileWidth(screenW);
  const remote = mediaUrl(att.url);
  // undefined = still checking the disk; null = not downloaded; string = local file:// URI.
  const [local, setLocal] = useState<string | null | undefined>(undefined);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void downloadedUri(att).then((uri) => { if (alive) setLocal(uri); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att.url]);

  // Resolved MIME (extension-derived when the stored one is generic) — a raw
  // "application/octet-stream" would make Android's open-with chooser come up empty.
  const openFile = (uri: string): void => onOpenFile({ uri, name: att.name || 'file', mime: attachmentMime(att) });

  const download = async (openAfter: boolean): Promise<void> => {
    if (progress !== null) return;
    setProgress(0);
    try {
      const uri = await downloadAttachment(att, setProgress);
      setLocal(uri);
      if (type === 'image' || type === 'video') {
        // Gallery via expo-media-library where the build has it; otherwise the shared-folder
        // copy — still surfaces in the Gallery app since shared storage is media-scanned.
        const saved = await saveMediaToDevice(uri, att.name || (type === 'image' ? 'photo.jpg' : 'video.mp4'), attachmentMime(att));
        if (saved === 'saved') showToast('Saved to gallery');
        else if (saved === 'denied') showToast('Allow photo access to save media to your gallery');
        // 'declined'/'failed': the file still lives in the app — nothing to nag about here.
      } else if (type === 'document' && !mine) {
        // Copy received documents into the user's shared folder so they show up in the phone's
        // Files app (asks the user to pick the folder once). Sender's own files skip this.
        const exported = await exportToSharedFolder(uri, att.name || 'file', attachmentMime(att));
        if (exported === 'saved') showToast('Saved — visible in your Files app');
      }
      if (openAfter) (type === 'image' ? onOpenImage : openFile)(uri);
    } catch {
      showToast('Download failed — check your connection');
    } finally {
      setProgress(null);
    }
  };

  // Centered overlay chip: download arrow + size (idle) or spinner + % (downloading).
  const gateChip = (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
      <View className="flex-row items-center gap-1.5" style={{ backgroundColor: OVERLAY, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
        {progress !== null ? (
          <>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{Math.round(progress * 100)}%</Text>
          </>
        ) : (
          <>
            <Download size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{humanSize(att.size)}</Text>
          </>
        )}
      </View>
    </View>
  );

  if (type === 'image') {
    const ratio = att.width && att.height ? att.height / att.width : 0.75;
    const h = Math.min(280, TILE_W * ratio);
    const gated = !mine && !local; // received & not on disk yet (or still checking)
    const onPress = (): void => {
      if (local) return onOpenImage(local);
      if (mine) return onOpenImage(remote);
      if (local === null) void download(false); // WhatsApp: tap the blurred photo to fetch it
    };
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} style={{ marginBottom: 4 }}>
        <Image source={{ uri: local ?? remote }} blurRadius={gated ? 16 : 0}
          style={{ width: TILE_W, height: h, borderRadius: 12, backgroundColor: colors.coolMuted }} resizeMode="cover" />
        {gated && local === null ? gateChip : null}
      </Pressable>
    );
  }

  if (type === 'video') {
    const thumb = att.thumbnailUrl ? mediaUrl(att.thumbnailUrl) : null;
    const ready = !!local || mine;
    const onPress = (): void => {
      if (local) return openFile(local);
      // Sender side has no gate, but the video still has to land on disk before it can play.
      if (local === null) void download(mine);
    };
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress}
        style={{ width: TILE_W, height: 140, borderRadius: 12, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginBottom: 4, overflow: 'hidden' }}>
        {thumb ? <Image source={{ uri: thumb }} blurRadius={ready ? 0 : 10} style={{ position: 'absolute', width: TILE_W, height: 140 }} /> : null}
        {ready && progress === null ? (
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={20} color={colors.ink} />
          </View>
        ) : null}
        {(!ready && local === null) || progress !== null ? gateChip : null}
      </Pressable>
    );
  }

  // document — WhatsApp-style file card: a tinted fixed-width panel inside the bubble with a
  // type-coloured file icon, two-line name, "size · EXT" meta, and the download control INSIDE
  // the card (a fixed width keeps long names truncating in the card instead of overflowing into
  // the quick-forward arrow beside the bubble).
  const ext = /\.([A-Za-z0-9]{1,6})$/.exec(att.name ?? '')?.[1]?.toUpperCase();
  const iconColor = ext === 'PDF' ? '#E2574C'
    : ext === 'DOC' || ext === 'DOCX' ? '#4F8BFF'
      : ext === 'XLS' || ext === 'XLSX' || ext === 'CSV' ? '#1F9D55'
        : colors.primary;
  const onDocPress = (): void => {
    if (local) return openFile(local);
    // Mine: fetch quietly and open in one tap. Received: first tap downloads, next tap opens.
    if (local === null) void download(mine);
  };
  return (
    <Pressable onPress={onDocPress} onLongPress={onLongPress} className="flex-row items-center gap-2.5"
      style={{ width: Math.max(TILE_W, TILE_MIN), maxWidth: '100%', borderRadius: 12, backgroundColor: mine ? '#E4F0EC' : '#F3F5F7', paddingHorizontal: 10, paddingVertical: 11, marginBottom: 4 }}>
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <FileText size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ color: colors.ink, fontSize: 13, fontWeight: '600', lineHeight: 17 }}>{att.name}</Text>
        <Text numberOfLines={1} style={{ color: colors.coolText3, fontSize: 11, marginTop: 2 }}>{humanSize(att.size)}{ext ? ` · ${ext}` : ''}</Text>
      </View>
      {progress !== null ? (
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : !mine && local === null ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.coolText3, alignItems: 'center', justifyContent: 'center' }}>
          <Download size={16} color={colors.coolText} />
        </View>
      ) : null}
    </Pressable>
  );
}
