import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { mediaUrl } from '../../api/media';
import { colors } from '../../theme';

// The screenshot attached to a reminder (set from KBiz Books with Space + R): a thumbnail under
// the text; tapping it opens the picture full screen. Plain views only inside the Modal — context
// providers do not reach into an RN Modal.
export function ReminderScreenshot({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const uri = mediaUrl(url);
  return (
    <>
      <Pressable accessibilityLabel="Open the screenshot" onPress={() => setOpen(true)} style={styles.thumbWrap}>
        <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Image source={{ uri }} style={styles.full} resizeMode="contain" />
          <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} hitSlop={12} style={styles.close}>
            <X size={20} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumbWrap: { marginTop: 6, alignSelf: 'flex-start', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.coolDivider, backgroundColor: colors.coolMuted },
  thumb: { width: 168, height: 96 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
  close: { position: 'absolute', top: 52, right: 18, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
});
