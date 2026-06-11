/** @type {import('tailwindcss').Config} */
// Theme tokens mirror src/theme/colors.ts (exact source `C` values). No redesign.
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        purple: '#9A6CF0', blue: '#4F8BFF', teal: '#37B6A4', orange: '#E8A13A', coral: '#E3674E',
        ink: '#0C0E14', ink2: '#171B26', canvas: '#F4F1EA', card: '#FFFFFF',
        cardEdge: '#EBE4D6', hair: '#EBE4D6', warmMute: '#9B8F7A',
        textMuted: '#6D6D72', textMuted2: '#7E8497', success: '#22C55E', danger: '#DC2626',
      },
      fontFamily: { serif: ['Fraunces', 'Georgia', 'serif'] },
      borderRadius: { card: '16px' },
    },
  },
  plugins: [],
};
