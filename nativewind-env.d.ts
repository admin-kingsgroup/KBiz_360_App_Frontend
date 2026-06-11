/// <reference types="nativewind/types" />

// Environment note: this install hoisted a duplicate react-native under nativewind/, so the
// upstream className augmentation can target the nested copy. This block guarantees the
// className prop is typed against the top-level react-native we import. Types-only — the
// NativeWind Babel plugin handles className at build time, so there is no runtime effect.
import 'react-native';
declare module 'react-native' {
  interface ViewProps { className?: string }
  interface TextProps { className?: string }
  interface ImageProps { className?: string }
  interface PressableProps { className?: string }
  interface ScrollViewProps { className?: string }
  interface TextInputProps { className?: string }
}
