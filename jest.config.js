const path = require('node:path');

module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^uuid$': path.resolve(__dirname, 'node_modules/uuid/dist/cjs/index.js'),
  },
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/support/'],
};
