/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^server-only$': '<rootDir>/src/__tests__/__mocks__/server-only.cjs',
    '^hazo_connect/server$': '<rootDir>/src/__tests__/__mocks__/hazo_connect_server.ts',
    '^hazo_notify/dispatcher$': '<rootDir>/src/__tests__/__mocks__/hazo_notify_dispatcher.ts',
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
