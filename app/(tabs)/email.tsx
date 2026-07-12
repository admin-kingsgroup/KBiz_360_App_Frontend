import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator, RefreshControl, ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, PenSquare, Inbox as InboxIcon, MailX, Mail, CheckCheck, Trash2, FolderPlus, X, ChevronDown, Check } from 'lucide-react-native';
import { EmailListItem } from '../../src/components/email';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { useUiStore } from '../../src/store/uiStore';
import { useMicrosoftEmail } from '../../src/hooks/useMicrosoftEmail';
import { emailsInFolder, searchEmails } from '../../src/logic/email';
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
  const markAllRead = useEmailStore((s) => s.markAllRead);
  const smartFolders = useEmailStore((s) => s.smartFolders);
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

  // Swipe a row → delete (move to Deleted, or permanently if already in Deleted).
  const onDelete = (item: Email) => {
    if (item.folder === 'deleted') { deleteForever(item.id); showToast('Deleted permanently'); }
    else { moveToFolder(item.id, 'deleted'); showToast('Moved to Deleted'); }
  };

  // Keep the list (not just the tab badge) fresh: refresh on focus, then poll lightly while the
  // tab stays open. silentRefresh re-fetches the newest page without a spinner and merges in new
  // mail — so a message that bumps the badge also appears in the list, no manual pull needed.
  useFocusEffect(
    useCallback(() => {
      const st = useEmailStore.getState();
      if (st.connected === null) void st.checkStatus();
      else if (st.connected) { void st.silentRefresh(); void st.refreshUnread(); }
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
    // Server results when ready; while the query is in flight show an instant client-side preview of
    // already-loaded mail so typing feels responsive.
    if (searchResults.length > 0 || !searching) return searchResults;
    return searchEmails(emailsInFolder(emails, folder), search);
  }, [emails, folder, search, searchResults, searching]);

  const open = (item: Email) => {
    if (item.folder === 'drafts') { router.push({ pathname: '/email/compose', params: { id: item.id } }); return; } // resume editing
    if (item.folder === 'inbox' && !item.read) markRead(item.id);
    router.push(`/email/${item.id}`);
  };

  // ── checking connection ──
  if (connected === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></SafeAreaView>;
  }

  // ── not connected: connect Microsoft account ──
  if (!connected) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
        <View className="flex-1 items-center justify-center px-8">
          <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><Mail size={36} color="#fff" /></View>
          <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 20 }}>Connect your email</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
            Sign in with your Microsoft 365 account to read and send your work email inside KBiz360. Only you can access your mailbox.
          </Text>
          {ms.configured ? (
            <Pressable onPress={ms.connect} disabled={!ms.ready || ms.connecting}
              className="flex-row items-center" style={{ gap: 8, marginTop: 24, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.ink, opacity: !ms.ready || ms.connecting ? 0.6 : 1 }}>
              {ms.connecting ? <ActivityIndicator color="#fff" size="small" /> : <Mail size={16} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{ms.connecting ? 'Connecting…' : 'Connect Microsoft 365'}</Text>
            </Pressable>
          ) : (
            <View style={{ marginTop: 24, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
              <Text style={{ color: colors.warmMute, fontSize: 12, textAlign: 'center' }}>Email isn&apos;t set up yet — your administrator needs to finish the Microsoft configuration.</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── connected: mailbox ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-1">
        <View className="flex-row items-center" style={{ gap: 10, flexShrink: 1 }}>
          <View>
            <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>Email</Text>
            {account ? <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, marginTop: 1, maxWidth: 130 }}>{account}</Text> : null}
          </View>
          {/* Folder selector — all folders + smart folders live in this dropdown (was a chip row). */}
          <Pressable onPress={() => setFolderOpen(true)} className="flex-row items-center"
            style={{ gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
            <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '700' }}>{EMAIL_FOLDERS.find((f) => f.key === folder)?.label ?? 'Inbox'}</Text>
            {folder === 'inbox' && inboxUnread > 0 ? (
              <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{inboxUnread}</Text>
              </View>
            ) : null}
            <ChevronDown size={14} color={colors.textMuted} />
          </Pressable>
        </View>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Pressable onPress={() => { void markAllRead(); showToast('Marked all as read'); }}
            style={{ width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
            <CheckCheck size={17} color={colors.ink} />
          </Pressable>
          <Pressable onPress={() => router.push('/email/compose')} className="flex-row items-center" style={{ gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.ink }}>
            <PenSquare size={15} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>Compose</Text>
          </Pressable>
        </View>
      </View>

      <View className="flex-row items-center mx-4 mt-2" style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
        <Search size={16} color={colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search mail" placeholderTextColor={colors.textMuted}
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.ink, fontSize: 14 }} />
      </View>

      {/* Smart folders (user-created) — tap to view; ＋ to create. Standard folders live in the
          dropdown next to the Email title. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}>
        {smartFolders.map((sf) => (
          <Pressable key={sf.id} onPress={() => router.push(`/email/folder/${sf.id}`)} className="flex-row items-center" style={{ gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.teal + '55' }}>
            <Text style={{ color: colors.teal, fontSize: 12.5, fontWeight: '700' }}>{sf.name}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setNewOpen(true)} className="flex-row items-center" style={{ gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge, borderStyle: 'dashed' }}>
          <FolderPlus size={13} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>Folder</Text>
        </Pressable>
      </ScrollView>

      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <Swipeable
            overshootRight={false}
            renderRightActions={() => (
              <Pressable onPress={() => onDelete(item)} style={{ width: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger }}>
                <Trash2 size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 4 }}>Delete</Text>
              </Pressable>
            )}
          >
            <EmailListItem email={item} folder={item.folder} onPress={() => open(item)} />
          </Swipeable>
        )}
        contentContainerStyle={list.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void useEmailStore.getState().loadFolder()} tintColor={colors.ink} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!search.trim()) void useEmailStore.getState().loadMore(); }}
        ListFooterComponent={loadingMore || searching ? <ActivityIndicator color={colors.textMuted} style={{ paddingVertical: 18 }} /> : null}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            {folder === 'deleted' ? <MailX size={40} color={colors.cardEdge} /> : <InboxIcon size={40} color={colors.cardEdge} />}
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 12 }}>
              {searching ? 'Searching…' : loading ? 'Loading…' : search ? 'No matching mail' : `No mail in ${folder}`}
            </Text>
          </View>
        }
      />

      {/* Folder dropdown: the standard folders (smart folders + create live in the chip row). */}
      <Modal visible={folderOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setFolderOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={() => setFolderOpen(false)}>
          <View style={{ marginTop: insets.top + 56, marginLeft: 16, width: 232, borderRadius: 16, backgroundColor: '#fff', paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
            {EMAIL_FOLDERS.map((f) => {
              const on = folder === f.key;
              return (
                <Pressable key={f.key} onPress={() => { setFolderOpen(false); if (!on) setFolder(f.key as EmailFolder); }}
                  className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, paddingVertical: 11 }}>
                  <Text style={{ color: colors.ink, fontSize: 14, fontWeight: on ? '800' : '600' }}>{f.label}</Text>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    {f.key === 'inbox' && inboxUnread > 0 ? (
                      <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{inboxUnread}</Text>
                      </View>
                    ) : null}
                    {on ? <Check size={15} color={colors.ink} /> : null}
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
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 4 }}>
              <View className="flex-row items-center" style={{ gap: 6 }}><FolderPlus size={16} color={colors.ink} /><Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 15, fontWeight: '700' }}>New smart folder</Text></View>
              <Pressable onPress={() => setNewOpen(false)} hitSlop={8}><X size={18} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={{ color: colors.textMuted2, fontSize: 11, marginBottom: 12 }}>Mail from these senders is filed here automatically — existing & future.</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 }}>FOLDER NAME</Text>
            <TextInput value={fName} onChangeText={setFName} autoFocus placeholder="e.g. Travkings" placeholderTextColor={colors.textMuted}
              style={fIn} />
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>FROM (DOMAIN OR EMAIL)</Text>
            <TextInput value={fFrom} onChangeText={setFFrom} autoCapitalize="none" autoCorrect={false} placeholder="travkings.com, accounts@travkings.com" placeholderTextColor={colors.textMuted}
              style={fIn} />
            <Text style={{ color: colors.textMuted2, fontSize: 10, marginTop: 6 }}>Separate multiple with commas. A domain matches everyone from that company.</Text>
            <Pressable onPress={createFolder} disabled={creating} style={{ marginTop: 14, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: creating ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{creating ? 'Creating…' : 'Create folder'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const fIn = { borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.ink, fontWeight: '600' as const };
