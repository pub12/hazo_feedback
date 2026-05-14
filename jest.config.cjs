/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        moduleResolution: 'bundler',
        module: 'ESNext',
      },
    }],
  },
  testMatch: ['**/src/__tests__/**/*.test.ts', '**/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test-app/'],
};
