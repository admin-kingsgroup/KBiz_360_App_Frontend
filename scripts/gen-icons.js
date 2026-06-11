/* Generates the KBiz 360 app icons from a vector pinwheel using the brand palette.
   Run: node scripts/gen-icons.js   (sharp is a dev-only dependency)
   Outputs into assets/: icon.png (iOS + base), adaptive-icon.png (Android adaptive
   foreground), splash-icon.png, favicon.png. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const W = 1024;
const C = W / 2;
const COL = {
  purple: '#9A6CF0', cream: '#D8D3C8', blue: '#4F8BFF',
  teal: '#37B6A4', orange: '#E8A13A', coral: '#E3674E', dark: '#0C0E14',
};
// Clockwise from the up-right blade, matching the supplied artwork.
const ORDER = ['cream', 'blue', 'teal', 'orange', 'coral', 'purple'];

const bw = 210, bh = 300, brx = 46, ox = 70, oy = 150;
const bx = C + ox - bw / 2;
const by = C - oy - bh / 2;

function blades() {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += `<g transform="rotate(${i * 60} ${C} ${C})"><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${brx}" fill="${COL[ORDER[i]]}"/></g>`;
  }
  return s;
}

// scale: shrink the pinwheel within the canvas (Android adaptive needs a safe margin).
function svg({ bg, scale = 0.9 }) {
  const bgRect = bg ? `<rect width="${W}" height="${W}" fill="${bg}"/>` : '';
  const mark = `<g transform="translate(${C} ${C}) scale(${scale}) translate(${-C} ${-C})">${blades()}<circle cx="${C}" cy="${C}" r="95" fill="${COL.dark}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${bgRect}${mark}</svg>`;
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

async function write(name, opts) {
  await sharp(Buffer.from(svg(opts))).png().toFile(path.join(outDir, name));
  console.log('wrote', name);
}

(async () => {
  await write('icon.png', { bg: COL.dark, scale: 0.9 });            // iOS + base: full dark square
  await write('adaptive-icon.png', { bg: null, scale: 0.78 });      // Android foreground (transparent, dark bg via app.json)
  await write('splash-icon.png', { bg: null, scale: 0.7 });         // splash mark on dark bg via app.json
  await write('favicon.png', { bg: COL.dark, scale: 0.82 });        // web
})();
