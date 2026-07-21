import { useUiStore } from '../../store/uiStore';
import { Toast } from './Toast';

// App-wide toast host. Mounted ONCE at the root (app/_layout.tsx) so every screen's showToast()
// is actually visible — the Toast component itself is presentational, and mounting it only inside
// the Home tab meant toasts fired from any other screen (attendance/chat/email/admin errors) set
// state that nothing rendered. Reads uiStore directly so no screen needs to wire it.
export function GlobalToast() {
  const toast = useUiStore((s) => s.toast);
  const showToast = useUiStore((s) => s.showToast);
  return <Toast message={toast} onHide={() => showToast(null)} />;
}
