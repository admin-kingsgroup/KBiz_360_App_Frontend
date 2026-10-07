import { useEffect } from 'react';
import { router } from 'expo-router';
import { useUiStore } from '../../src/store/uiStore';

// Manual approval requests raised in the app are stopped for now (owner 2026-10-07). The Approvals
// tab no longer links here; an old deep link or notification lands back where it came from with a
// short note. The form (RequestForm in ApprovalsScreen) is kept so this can be switched back on.
export default function NewApprovalRequestScreen() {
  const showToast = useUiStore((s) => s.showToast);
  useEffect(() => {
    showToast('New approval requests are paused');
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/approvals');
  }, [showToast]);
  return null;
}
