import { Modal as RNModal, View, type ModalProps } from 'react-native';
import { useSideInsets } from '../layout/SideSafeArea';

// Use this, never react-native's Modal (src/__tests__/modalSideInsets.test.ts holds the line).
//
// A React Native Modal opens its own native window, outside the app root that SideSafeArea pads,
// so on the iPhone Duo's closed screen its sheets and cards ran under the side strip that holds the
// status bar and camera (seen on the location disclosure). Same component, same props: when a side
// strip is showing, the content sits in a full-size View padded off it; everywhere else (every other
// iPhone, every Android phone) the children go straight into react-native's Modal, untouched.
export function Modal({ children, ...props }: ModalProps) {
  const { left, right } = useSideInsets();
  return (
    <RNModal {...props}>
      {left > 0 || right > 0
        ? <View style={{ flex: 1, paddingLeft: left, paddingRight: right }}>{children}</View>
        : children}
    </RNModal>
  );
}
