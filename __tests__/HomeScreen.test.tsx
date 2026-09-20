/**
 * Phase 1 smoke test — renders HomeScreen in isolation.
 * Wrapped in SafeAreaProvider because HomeScreen calls useSafeAreaInsets.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// HomeScreen imports @react-navigation/native for its __DEV__ diagnostics button.
// The ESM build of react-navigation is not transformed by Jest — stub it out
// for this smoke test so we can render HomeScreen in isolation.
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { HomeScreen } from '../src/screens/HomeScreen';

test('HomeScreen renders without crashing', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider>
        <HomeScreen />
      </SafeAreaProvider>,
    );
  });
  expect(tree).toBeDefined();
});
