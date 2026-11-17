import { useWindowDimensions } from 'react-native';
import { isCompactHeight } from '../logic/wideLayout';

/** True on a short window (the iPhone Duo, either screen; an iPhone SE): see COMPACT_MAX_HEIGHT. */
export function useCompactChrome(): boolean {
  return isCompactHeight(useWindowDimensions().height);
}
