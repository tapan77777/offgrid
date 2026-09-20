/**
 * Phase 1 smoke test — renders HomeScreen in isolation.
 * Wrapped in SafeAreaProvider because HomeScreen calls useSafeAreaInsets.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
