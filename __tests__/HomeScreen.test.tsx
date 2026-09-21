/**
 * Consumer HomeScreen smoke test.
 * Wrapped in SafeAreaProvider because Screen uses useSafeAreaInsets.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { HomeScreen } from '../src/screens/HomeScreen';

test('HomeScreen renders without crashing', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      // Seed initial insets so SafeAreaProvider renders children synchronously
      // — otherwise the tree is empty until layout arrives.
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <HomeScreen />
      </SafeAreaProvider>,
    );
  });
  expect(tree).toBeDefined();
  const root = tree!.root;
  // Home surfaces at least one honest "no connection" indicator so the user
  // is never misled about connectivity (D-029, CLAUDE.md §20).
  const matches = root.findAll(
    n => n.props?.testID === 'home-connection-status',
  );
  expect(matches.length).toBeGreaterThan(0);
});
