module.exports = {
  preset: 'ts-jest',
  globals: {
    __DEV__: true,
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['html', 'lcov', 'text'],
  collectCoverageFrom: [
    'src/**/*.ts',
  ],
  watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/.git/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/*spec.[jt]s?(x)'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      }
    ]
  },
  moduleNameMapper: {
    'rata': '<rootDir>/../../../rata/src',
    'axii': '<rootDir>/../../../axii/src'
  },
}
