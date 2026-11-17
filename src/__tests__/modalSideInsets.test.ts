import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

// A React Native <Modal> opens its own native window, outside the app root that SideSafeArea pads
// off the iPhone Duo's side strip (status bar + camera on the closed screen). Its content then runs
// under the strip. src/components/ui/Modal is the same component with that padding added, so every
// screen must take Modal from there — this test fails on any file that imports it from react-native.

const ROOTS = ['app', 'src'];
const WRAPPER = join('src', 'components', 'ui', 'Modal.tsx');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__tests__' ? [] : sourceFiles(full);
    return e.isFile() && /\.tsx?$/.test(full) ? [full] : [];
  });
}

// Every `import { … } from 'react-native'` (single- or multi-line) whose names include Modal itself
// (not ModalProps or another Modal-prefixed type).
function importsRnModal(src: string): boolean {
  const re = /import\s*\{([^}]*)\}\s*from\s*'react-native'/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const names = m[1].split(',').map((n) => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]);
    if (names.includes('Modal')) return true;
  }
  return false;
}

describe('Modal comes from src/components/ui/Modal (iPhone Duo side strip)', () => {
  const root = join(__dirname, '..', '..');
  const files = ROOTS.flatMap((r) => sourceFiles(join(root, r)));

  it('finds the app sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no screen imports react-native's Modal directly", () => {
    const offenders = files
      .filter((f) => relative(root, f) !== WRAPPER)
      .filter((f) => importsRnModal(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('recognises the import shapes it guards against', () => {
    expect(importsRnModal("import { View, Modal } from 'react-native';")).toBe(true);
    expect(importsRnModal("import {\n  View,\n  Modal,\n} from 'react-native';")).toBe(true);
    expect(importsRnModal("import { type ModalProps, View } from 'react-native';")).toBe(false);
    expect(importsRnModal("import { Modal } from '../ui/Modal';")).toBe(false);
  });
});
