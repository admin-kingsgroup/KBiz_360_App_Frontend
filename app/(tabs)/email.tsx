import { useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, PenSquare, Inbox as InboxIcon, MailX } from 'lucide-react-native';
import { EmailListItem } from '../../src/components/email';
import { colors } from '../../src/theme';
import { useEmailStore } from '../../src/store/emailStore';
import { emailsInFolder, searchEmails, unreadCount } from '../../src/logic/email';
import { EMAIL_FOLDERS, type EmailFolder } from '../../src/types';

export default function EmailScreen() {
  const router = useRouter();
  const emails = useEmailStore((s) => s.emails);
  const folder = useEmailStore((s) => s.folder);
  const search = useEmailStore((s) => s.search);
  const setFolder = useEmailStore((s) => s.setFolder);
  const setSearch = useEmailStore((s) => s.setSearch);
  const markRead = useEmailStore((s) => s.markRead);

  const list = useMemo(() => searchEmails(emailsInFolder(emails, folder), search), [emails, folder, search]);

  const open = (id: string) => {
    if (folder === 'inbox') markRead(id);
    router.push(`/email/${id}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-2 pb-3">
        <Text style={{ fontFamily: 'Fraunces', color: colors.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>Email</Text>
        <Pressable onPress={() => router.push('/email/compose')} className="flex-row items-center" style={{ gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.ink }}>
          <PenSquare size={15} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>Compose</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View className="flex-row items-center mx-4" style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge }}>
        <Search size={16} color={colors.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search mail" placeholderTextColor={colors.textMuted}
          autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.ink, fontSize: 14 }} />
      </View>

      {/* Folder tabs */}
      <View className="flex-row px-4" style={{ gap: 8, paddingVertical: 12 }}>
        {EMAIL_FOLDERS.map((f) => {
          const on = folder === f.key;
          const badge = f.key === 'inbox' ? unreadCount(emails, 'inbox') : 0;
          return (
            <Pressable key={f.key} onPress={() => setFolder(f.key as EmailFolder)} className="flex-row items-center" style={{ gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? colors.ink : colors.card, borderWidth: 1, borderColor: on ? colors.ink : colors.cardEdge }}>
              <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12.5, fontWeight: '700' }}>{f.label}</Text>
              {badge > 0 ? (
                <View style={{ minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: on ? '#fff' : colors.blue, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: on ? colors.ink : '#fff', fontSize: 10, fontWeight: '800' }}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EmailListItem email={item} folder={folder} onPress={() => open(item.id)} />}
        contentContainerStyle={list.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
            {folder === 'deleted' ? <MailX size={40} color={colors.cardEdge} /> : <InboxIcon size={40} color={colors.cardEdge} />}
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 12 }}>
              {search ? 'No matching mail' : `No mail in ${folder}`}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
