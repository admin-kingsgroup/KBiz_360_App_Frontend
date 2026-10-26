import { Image, View, type ImageSourcePropType } from 'react-native';
import { KBLogo } from './KBLogo';
import type { BrandLogo } from '../../logic/groupsStrip';

// The bundled company logos (assets/brands), cut from the owner's files on 2026-10-10 with their white
// page made transparent. KBiz is the app's own vector pinwheel. Metro bundles an image by its
// require(); the repo has no *.png module typing for an import.
/* eslint-disable @typescript-eslint/no-require-imports */
const PICTURES: Record<Exclude<BrandLogo, 'kbiz'>, ImageSourcePropType> = {
  travkings: require('../../../assets/brands/travkings.png'),
  quinaliza: require('../../../assets/brands/quin-aliza.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

// A company logo on a white chip in every theme: the logos are drawn for a white page, and a dark
// bar would swallow Quin Aliza's black A. The hairline keeps the chip's edge on the white themes.
export function BrandMark({ logo, size, radius, border }: { logo: BrandLogo; size: number; radius: number; border: string }) {
  const inner = Math.round(size * 0.74);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, borderWidth: 1, borderColor: border, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {logo === 'kbiz'
        // The pinwheel fills ~68% of KBLogo's own box, so this lands it at the same ~74% as the pictures.
        ? <KBLogo size={Math.round(size * 1.08)} />
        : <Image source={PICTURES[logo]} style={{ width: inner, height: inner }} resizeMode="contain" accessibilityIgnoresInvertColors />}
    </View>
  );
}
