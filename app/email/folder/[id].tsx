import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Trash2, Inbox as InboxIcon } from 'lucide-react-native';
import { EmailListItem } from '../../../src/components/email';
import { colors } from '../../../src/theme';
import { useEmailStore } from '../../../src/store/emailStore';
import { useUiStore } from '../../../src/store/uiStore';
import { listFolderMessages, EMAIL_PAGE } from '../../../src/api/email';
import type { Email } from '../../../src/types';

// A smart folder's mailbox view — lists the mail the backend has auto-filed here (by sender rule).
export default function SmartFolderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const folderId = id ?? '';
  const showToast = useUiStore((s) => s.showToast);
  const folder = useEmailStore((s) => s.smartFolders.find((f) => f.id === folderId));
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const list = await listFolderMessages(folderId, 0); setEmails(list); setHasMore(list.length >= EMAIL_PAGE); }
    catch { /* keep */ } finally { setLoading(false); }
  }, [folderId]);

  useEffect(() => { void load(); if (useEmailStore.getState().smartFolders.length === 0) void useEmailStore.getState().loadSmartFolders(); }, [load]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await listFolderMessages(folderId, emails.length);
      setEmails((cur) => { const have = new Set(cur.map((e) => e.id)); return [...cur, ...more.filter((e) => !have.has(e.id))]; });
      setHasMore(more.length >= EMAIL_PAGE);
    } catch { /* keep */ } finally { setLoadingMore(false); }
  };

  const confirmDelete = () => Alert.alert('Delete folder', `Stop auto-filing into "${folder?.name ?? 'this folder'}"? The folder and its mail stay in Outlook — only the rule is removed.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void useEmailStore.getState().deleteSmartFolder(folderId); showToast('Folder rule removed'); router.back(); } },
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: '#fff', borderBottomColor: colors.cardEdge, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={22} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text numberOfLines={1} style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '600' }}>{folder?.name ?? 'Folder'}</Text>
          {folder?.from?.length ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 10.5 }}>Auto-files mail from {folder.from.join(', ')}</Text> : null}
        </View>
        <Pressable onPress={confirmDelete} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={17} color={colors.danger} /></Pressable>
      </View>

      <FlatList
        data={emails}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EmailListItem email={item} folder={item.folder} onPress={() => router.push(`/email/${item.id}`)} />}
        contentContainerStyle={emails.length === 0 ? { flex: 1 } : { paddingBottom: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.ink} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.textMuted} style={{ paddingVertical: 18 }} /> : null}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <InboxIcon size={40} color={colors.cardEdge} />
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 12 }}>{loading ? 'Loading…' : 'No mail filed here yet'}</Text>
            {!loading ? <Text style={{ color: colors.textMuted2, fontSize: 11.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}>New mail from the matching senders will appear here automatically.</Text> : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}
