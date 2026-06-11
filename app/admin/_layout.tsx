import { Stack } from 'expo-router';
export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="users" />
      <Stack.Screen name="roles" />
      <Stack.Screen name="user-form" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
