module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2021, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2021: true, node: true },
  ignorePatterns: ['node_modules/', 'dist/', '.expo/', '*.config.js', 'babel.config.js', 'metro.config.js'],
  rules: {
    'no-undef': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // React hooks linting (warnings only — surfaces issues without failing the lint gate, and
    // makes the `react-hooks/exhaustive-deps` disable comments resolve).
    'react-hooks/rules-of-hooks': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [{ files: ['**/__tests__/**'], env: { jest: true } }]
};
