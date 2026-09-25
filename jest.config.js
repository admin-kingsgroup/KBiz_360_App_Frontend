module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // macOS writes AppleDouble metadata files (._foo.test.ts) on exFAT drives — never real tests.
  testPathIgnorePatterns: ['/node_modules/', '/\\._'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};
