import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

// A React Native <Modal> renders in a SEPARATE native view tree, so root-level providers do not
// reach inside it. <SafeAreaView> is the native RNCSafeAreaView, which resolves its insets by
// walking `reactSuperview` up to the RNCSafeAreaProvider — inside a Modal that walk finds nothing
// and it silently applies ZERO padding. The symptom is not a crash but a header that slides under
// the status bar, taking its close button with it: the chat file viewer shipped that way and the
// only way out of the PDF was to force-quit the app.
//
// Inside a Modal, read the insets in the SCREEN scope with useSafeAreaInsets() and apply
// paddingTop / paddingBottom by hand. (Same reason the ZoomableImage modal carries its own
// GestureHandlerRootView.)

const ROOTS = ['app', 'src'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__tests__' ? [] : sourceFiles(full);
    return e.isFile() && full.endsWith('.tsx') ? [full] : [];
  });
}

// Walks the file once, tracking how deeply nested we are in <Modal> tags, and reports every
// <SafeAreaView> opened while inside one.
function safeAreaViewsInsideModal(src: string): number[] {
  const lines = src.split('\n');
  const offenders: number[] = [];
  let depth = 0;
  lines.forEach((line, i) => {
    const code = line.replace(/\{\/\*.*?\*\/\}/g, ''); // ignore single-line JSX comments
    if (depth > 0 && /<SafeAreaView[\s>]/.test(code)) offenders.push(i + 1);
    depth += (code.match(/<Modal[\s>]/g) ?? []).length;
    depth -= (code.match(/<\/Modal>/g) ?? []).length;
    if (depth < 0) depth = 0;
  });
  return offenders;
}

describe('no <SafeAreaView> inside a <Modal>', () => {
  const files = ROOTS.flatMap(sourceFiles);

  it('scans the whole app', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s', (file) => {
    const offenders = safeAreaViewsInsideModal(readFileSync(file, 'utf8'));
    expect(
      offenders.length ? `${relative('.', file)} lines ${offenders.join(', ')}` : '',
    ).toBe('');
  });
});
