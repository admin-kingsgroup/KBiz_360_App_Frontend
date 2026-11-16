import { useWindowDimensions } from 'react-native';
import { isWideWidth } from '../logic/wideLayout';

// True when the window is wide enough for list + detail side by side: the iPhone Duo opened
// (its 7.6" inner screen). Re-renders on every window resize, so folding or unfolding the phone
// flips it live. Read the WINDOW, never the screen: under iOS 27 the app's window can be resized.
export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return isWideWidth(width);
}
