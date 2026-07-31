import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, RefreshControl, ScrollView, Modal, KeyboardAvoidingView, Platform, Alert, type ListRenderItem } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, PenSquare, Inbox as InboxIcon, MailX, Mail, Folder as FolderIcon, FolderPlus, X, ChevronDown, Check } from 'lucide-react-native';
import { EmailListItem } from '../../src/components/email';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { useUiStore } from '../../src/store/uiStore';
import { useMicrosoftEmail } from '../../src/hooks/useMicrosoftEmail';
import { emailsInFolder, searchEmails, mergeSearchResults } from '../../src/logic/email';
import { EMAIL_FOLDERS, type EmailFolder, type Email } from '../../src/types';

export default function EmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const emails = useEmailStore((s) => s.emails);
  const folder = useEmailStore((s) => s.folder);
  const search = useEmailStore((s) => s.search);
  const connected = useEmailStore((s) => s.connected);
  const account = useEmailStore((s) => s.account);
  const loading = useEmailStore((s) => s.loading);
  const loadingMore = useEmailStore((s) => s.loadingMore);
  const inboxUnread = useEmailStore((s) => s.inboxUnread);
  const searchResults = useEmailStore((s) => s.searchResults);
  const searching = useEmailStore((s) => s.searching);
  const setFolder = useEmailStore((s) => s.setFolder);
  const setSearch = useEmailStore((s) => s.setSearch);
  const markRead = useEmailStore((s) => s.markRead);
  const moveToFolder = useEmailStore((s) => s.moveToFolder);
  const deleteForever = useEmailStore((s) => s.deleteForever);
  const smartFolders = useEmailStore((s) => s.smartFolders);
  const outlookFolders = useEmailStore((s) => s.outlookFolders);
  const showToast = useUiStore((s) => s.showToast);
  const ms = useMicrosoftEmail();

  // Folder dropdown (replaces the old filter-chip row) + create-smart-folder modal state.
  const [folderOpen, setFolderOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [creating, setCreating] = useState(false);
  const createFolder = async () => {
    const name = fName.trim();
    const from = fFrom.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!name) { showToast('Folder name required'); return; }
    if (!from.length) { showToast('Add a sender domain or email to match'); return; }
    setCreating(true);
    const sf = await useEmailStore.getState().createSmartFolder(name, from);
    setCreating(false);
    if (!sf) { showToast('Could not create folder'); return; }
    setNewOpen(false); setFName(''); setFFrom('');
    showToast(`"${sf.name}" created — existing & new mail will file here`);
    router.push(`/email/folder/${sf.id}`);
  };

  // Real Outlook folders that AREN'T already shown as a smart folder (a smart folder IS an Outlook
  // folder — its graphFolderId would otherwise render the same folder twice).
  const customFolders = useMemo(
    () => outlookFolders.filter((f) => !smartFolders.some((sf) => sf.graphFolderId === f.id)),
    [outlookFolders, smartFolders],
  );

  // Swipe a row → delete (move to Deleted, or permanently if already in Deleted).
  // Stable references (rows are memoized — a fresh callback per render would repaint every row).
  const onDelete = useCallback((item: Email) => {
    if (item.folder === 'deleted') { deleteForever(item.id); showToast('Deleted permanently'); }
    else { moveToFolder(item.id, 'deleted'); showToast('Moved to Deleted'); }
  }, [deleteForever, moveToFolder, showToast]);

  // Keep the list (not just the tab badge) fresh: refresh on focus, then poll lightly while the
  // tab stays open. silentRefresh re-fetches the newest page without a spinner and merges in new
  // mail — so a message that bumps the badge also appears in the list, no manual pull needed.
  useFocusEffect(
    useCallback(() => {
      const st = useEmailStore.getState();
      if (st.connected === null) void st.checkStatus();
      else if (st.connected) { void st.silentRefresh(); void st.refreshUnread(); void st.loadOutlookFolders(); void st.syncAll(); }
      const timer = setInterval(() => {
        const s = useEmailStore.getState();
        if (s.connected && !s.search.trim()) { void s.silentRefresh(); void s.refreshUnread(); }
      }, 30000);
      return () => clearInterval(timer);
    }, []),
  );

  // Debounced server-side search (Graph $search across the whole folder, not just loaded mail).
  useEffect(() => {
    const q = search.trim();
    const t = setTimeout(() => { void useEmailStore.getState().runSearch(q); }, 400);
    return () => clearTimeout(t);
  }, [search, folder]);

  const list = useMemo(() => {
    const q = search.trim();
    if (!q) return emailsInFolder(emails, folder);
    // Server results ($search spans the whole mailbox) UNIONED with client-side matches of every
    // loaded message — so results appear instantly while the query is in flight, AND a Graph
    // failure/miss (partial words, transient errors) still shows the locally loaded matches
    // instead of a false "No matching mail".
    return mergeSearchResults(searchResults, searchEmails(emails, q));
  }, [emails, folder, search, searchResults]);

  const open = useCallback((item: Email) => {
    if (item.folder === 'drafts') { router.push({ pathname: '/email/compose', params: { id: item.id } }); return; } // resume editing
    if (item.folder === 'inbox' && !item.read) markRead(item.id);
    router.push(`/email/${item.id}`);
  }, [router, markRead]);

  // Rows are memo components — with stable onOpen/onDelete, a keystroke in search or the 30s
  // silent refresh no longer repaints every visible row (that repainting was the list lag).
  const renderItem: ListRenderItem<Email> = useCallback(({ item }) => (
    <EmailListItem email={item} folder={item.folder} onOpen={open} onDelete={onDelete} />
  ), [open, onDelete]);

  // ── checking connection ──
  if (connected === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></SafeAreaView>;
  }

  // ── not connected: connect Microsoft account ──
  if (!connected) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
        <View className="flex-1 items-center justify-center px-8">
          <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Mail size={46} color={colors.primary} /></View>
          <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 20 }}>Connect your email</Text>
          <Text style={{ color: colors.coolText, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
            Sign in with your Microsoft 365 account to read and send your work email inside KBiz360. Only you can access your mailbox.
          </Text>
          {ms.configured ? (
            <Pressable onPress={ms.connect} disabled={!ms.ready || ms.connecting}
              className="flex-row items-center" style={{ gap: 8, marginTop: 24, paddingHorizontal: 24, height: 50, borderRadius: 999, backgroundColor: colors.primary, opacity: !ms.ready || ms.connecting ? 0.6 : 1 }}>
              {ms.connecting ? <ActivityIndicator color="#fff" size="small" /> : <Mail size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{ms.connecting ? 'Connecting…' : 'Connect Microsoft 365'}</Text>
            </Pressable>
          ) : (
            <View style={{ marginTop: 24, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.coolDivider }}>
              <Text style={{ color: colors.coolText, fontSize: 13, textAlign: 'center' }}>Email isn&apos;t set up yet — your administrator needs to finish the Microsoft configuration.</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── connected: mailbox ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.coolBg }} edges={['top']}>
      {/* White header bar (standard chrome). The left group takes the remaining width (flex + minWidth:0
          so its children can shrink); the title/account truncate first while the folder chip and the
          Compose button stay a fixed size — this stops the "Inbox" chip overlapping Compose on narrow phones. */}
      <View className="flex-row items-center px-4" style={{ backgroundColor: colors.card, minHeight: 60, paddingVertical: 8, borderBottomColor: colors.coolDivider, borderBottomWidth: 1 }}>
        <View className="flex-row items-center" style={{ gap: 10, flex: 1, minWidth: 0 }}>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>Email</Text>
            {account ? <Text numberOfLines={1} style={{ color: colors.coolText, fontSize: 12, marginTop: 1 }}>{account}</Text> : null}
          </View>
          {/* Folder selector — all folders + smart folders live in this dropdown (was a chip row). */}
          <Pressable onPress={() => setFolderOpen(true)} className="flex-row items-center"
            style={{ gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.coolMuted, flexShrink: 0 }}>
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{EMAIL_FOLDERS.find((f) => f.key === folder)?.label ?? 'Inbox'}</Text>
            {folder === 'inbox' && inboxUnread > 0 ? (
              <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{inboxUnread}</Text>
              </View>
            ) : null}
            <ChevronDown size={15} color={colors.coolText} />
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('/email/compose')} accessibilityLabel="Compose" className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, flexShrink: 0, marginLeft: 10 }}>
          <PenSquare size={19} color="#fff" />
        </Pressable>
      </View>

      {/* Grey pill search */}
      <View className="flex-row items-center mx-4" style={{ gap: 12, height: 48, marginTop: 12, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.coolMuted }}>
        <Search size={19} color={colors.coolText3} strokeWidth={2.2} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search mail" placeholderTextColor={colors.coolText3}
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.ink, fontSize: 15 }} />
      </View>

      {/* Your folders — smart folders (auto-file rules) + every folder created in Outlook itself.
          Tap to view its mail; ＋ to create. Standard folders live in the dropdown next to the title. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' }}>
        {smartFolders.map((sf) => (
          <Pressable key={sf.id} onPress={() => router.push(`/email/folder/${sf.id}`)}
            onLongPress={() => Alert.alert(`Delete “${sf.name}”?`, 'The folder and its rule are removed; its emails move to Deleted Items in Outlook.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { void useEmailStore.getState().deleteSmartFolder(sf.id); showToast('Folder deleted'); } },
            ])}
            className="flex-row items-center" style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.primarySoft }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{sf.name}</Text>
          </Pressable>
        ))}
        {customFolders.map((f) => (
          <Pressable key={f.id} onPress={() => router.push({ pathname: '/email/outlook/[id]', params: { id: f.id, name: f.name } })}
            onLongPress={() => Alert.alert(`Delete “${f.name}”?`, 'The folder is removed; its emails move to Deleted Items in Outlook.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { void useEmailStore.getState().deleteOutlookFolder(f.id); showToast('Folder deleted'); } },
            ])}
            className="flex-row items-center" style={{ gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.primarySoft }}>
            <FolderIcon size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{f.name}</Text>
            {f.unread > 0 ? (
              <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{f.unread}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
        <Pressable onPress={() => setNewOpen(true)} className="flex-row items-center" style={{ gap: 4, height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.coolDivider, borderStyle: 'dashed' }}>
          <FolderPlus size={14} color={colors.coolText} />
          <Text style={{ color: colors.coolText, fontSize: 13, fontWeight: '600' }}>Folder</Text>
        </Pressable>
      </ScrollView>

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        windowSize={9}
        maxToRenderPerBatch={12}
        initialNumToRender={12}
        removeClippedSubviews
        contentContainerStyle={list.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void useEmailStore.getState().loadFolder()} tintColor={colors.primary} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!search.trim()) void useEmailStore.getState().loadMore(); }}
        ListFooterComponent={loadingMore || searching ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 18 }} /> : null}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60, paddingHorizontal: 32 }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              {folder === 'deleted' ? <MailX size={40} color={colors.primary} /> : <InboxIcon size={40} color={colors.primary} />}
            </View>
            <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
              {searching ? 'Searching…' : loading ? 'Loading…' : search ? 'No matching mail' : `No mail in ${folder}`}
            </Text>
          </View>
        }
      />

      {/* Folder dropdown: the standard folders (smart folders + create live in the chip row). */}
      <Modal visible={folderOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setFolderOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={() => setFolderOpen(false)}>
          <View style={{ marginTop: insets.top + 56, marginLeft: 16, width: 232, borderRadius: 18, backgroundColor: colors.card, paddingVertical: 6, shadowColor: '#0b1220', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
            {EMAIL_FOLDERS.map((f) => {
              const on = folder === f.key;
              return (
                <Pressable key={f.key} onPress={() => { setFolderOpen(false); if (!on) setFolder(f.key as EmailFolder); }} android_ripple={{ color: colors.coolMuted }}
                  className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ color: on ? colors.primary : colors.ink, fontSize: 15, fontWeight: on ? '700' : '500' }}>{f.label}</Text>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    {f.key === 'inbox' && inboxUnread > 0 ? (
                      <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{inboxUnread}</Text>
                      </View>
                    ) : null}
                    {on ? <Check size={16} color={colors.primary} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Create smart folder */}
      <Modal visible={newOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setNewOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
              <View className="flex-row items-center" style={{ gap: 8 }}><FolderPlus size={18} color={colors.primary} /><Text style={{ color: colors.ink, fontSize: 17, fontWeight: '700' }}>New smart folder</Text></View>
              <Pressable onPress={() => setNewOpen(false)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coolMuted }}><X size={18} color={colors.coolText} /></Pressable>
            </View>
            <Text style={{ color: colors.coolText, fontSize: 12.5, marginBottom: 12 }}>Mail from these senders is filed here automatically — existing & future.</Text>
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>FOLDER NAME</Text>
            <TextInput value={fName} onChangeText={setFName} autoFocus placeholder="e.g. Travkings" placeholderTextColor={colors.coolText3}
              style={fIn} />
            <Text style={{ color: colors.coolText, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>FROM (DOMAIN OR EMAIL)</Text>
            <TextInput value={fFrom} onChangeText={setFFrom} autoCapitalize="none" autoCorrect={false} placeholder="travkings.com, accounts@travkings.com" placeholderTextColor={colors.coolText3}
              style={fIn} />
            <Text style={{ color: colors.coolText3, fontSize: 11, marginTop: 6 }}>Separate multiple with commas. A domain matches everyone from that company.</Text>
            <Pressable onPress={createFolder} disabled={creating} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', opacity: creating ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{creating ? 'Creating…' : 'Create folder'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const fIn = { backgroundColor: colors.coolMuted, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.ink, fontWeight: '500' as const };
