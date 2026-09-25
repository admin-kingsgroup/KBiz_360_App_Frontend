import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Folder as FolderIcon } from 'lucide-react-native';
import { EmailListItem } from '../../../src/components/email';
import { colors } from '../../../src/theme';
import { useEmailStore } from '../../../src/store/emailStore';
import * as emailApi from '../../../src/api/email';
import { EMAIL_PAGE } from '../../../src/api/email';
import type { Email } from '../../../src/types';

// A real Outlook folder's mailbox view — lists the mail the user filed here (in Outlook or via the
// app's "Move to folder"). The folder id is the Graph mailFolder id; `name` rides along as a param
// so the header renders instantly (the store copy supplies live counts when loaded).
export default function OutlookFolderScreen() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const folderId = id ?? '';
  const folder = useEmailStore((s) => s.outlookFolders.find((f) => f.id === folderId));
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Opening an unread message marks it read (list-local + server); the message itself isn't in the
  // main store list, so the detail screen's loadMessage will fetch and adopt it.
  const openEmail = useCallback((e: Email) => {
    if (!e.read) {
      setEmails((cur) => cur.map((x) => (x.id === e.id ? { ...x, read: true } : x)));
      void emailApi.setRead(e.id, true).catch(() => undefined);
    }
    router.push(`/email/${e.id}`);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await emailApi.listOutlookFolderMessages(folderId, 0);
      setEmails(list);
      setHasMore(list.length >= EMAIL_PAGE);
      useEmailStore.getState().cacheFolderPage(folderId, list); // keep the offline copy fresh
    } catch {
      // Offline: serve the synced offline copy (syncAll caches every user folder's mail).
      const cached = useEmailStore.getState().emails.filter((e) => e.graphFolderId === folderId).sort((a, b) => b.ts - a.ts);
      if (cached.length) { setEmails(cached); setHasMore(false); }
    } finally { setLoading(false); }
  }, [folderId]);

  useEffect(() => {
    void load();
    if (useEmailStore.getState().outlookFolders.length === 0) void useEmailStore.getState().loadOutlookFolders();
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await emailApi.listOutlookFolderMessages(folderId, emails.length);
      setEmails((cur) => { const have = new Set(cur.map((e) => e.id)); return [...cur, ...more.filter((e) => !have.has(e.id))]; });
      setHasMore(more.length >= EMAIL_PAGE);
      useEmailStore.getState().cacheFolderPage(folderId, more);
    } catch { /* keep */ } finally { setLoadingMore(false); }
  };

  const title = folder?.name ?? name ?? 'Folder';
  const subtitle = folder ? `${folder.total} message${folder.total === 1 ? '' : 's'}${folder.unread ? ` · ${folder.unread} unread` : ''}` : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-2" style={{ minHeight: 60, paddingVertical: 8, backgroundColor: colors.card, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} color={colors.ink} /></Pressable>
        <View className="flex-1">
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12 }}>{subtitle}</Text> : null}
        </View>
      </View>

      <FlatList
        data={emails}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EmailListItem email={item} folder={item.folder} onOpen={openEmail} />}
        contentContainerStyle={emails.length === 0 ? { flex: 1 } : { paddingBottom: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 18 }} /> : null}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            <FolderIcon size={42} color={colors.coolText3} />
            <Text style={{ color: colors.coolText, fontSize: 14, fontWeight: '600', marginTop: 12 }}>{loading ? 'Loading…' : 'This folder is empty'}</Text>
            {!loading ? <Text style={{ color: colors.coolText3, fontSize: 12.5, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}>Move mail here from a message&apos;s &quot;Move to folder&quot; action, or file it in Outlook.</Text> : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}
