import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useEventCallback } from './useEventCallback';

// Run a loader every time the screen gains focus — on first mount AND when the user comes back to
// it (a pushed form/modal closing, a tab switch). Replaces mount-only `useEffect(load, [])` on data
// screens so a save/update/delete done ON TOP of this screen shows the moment the user returns,
// instead of only after closing and reopening the screen.
//
// The loader may return a cleanup (e.g. an `active = false` guard); it runs on blur/unmount.
// The loader always reads the latest render's state/props (useEventCallback), so callers don't
// have to thread deps through.
export function useRefreshOnFocus(load: () => void | (() => void)): void {
  const stable = useEventCallback(load);
  useFocusEffect(useCallback(() => stable(), [stable]));
}
