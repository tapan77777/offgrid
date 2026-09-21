/**
 * ConnectionStatus renders consumer-facing labels only — no wifi/socket
 * terminology should leak. Verifies each mapped state produces the label
 * from 06-UX-FLOWS §11.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import {
  ConnectionStatus,
  type ConnectionState,
} from '../../src/components/ConnectionStatus';

function renderState(state: ConnectionState): string {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ConnectionStatus state={state} nearbyCount={2} lastSeenMinutes={3} />,
    );
  });
  const texts = tree!.root
    .findAllByType(Text)
    .map(node => (Array.isArray(node.props.children) ? node.props.children.join(' ') : String(node.props.children)));
  return texts.join(' | ');
}

test('ConnectionStatus surfaces internet label', () => {
  expect(renderState('internet')).toContain('Internet connected');
});

test('ConnectionStatus surfaces local connection with count', () => {
  const text = renderState('localConnected');
  expect(text).toContain('Local connection');
  expect(text).toContain('2 devices nearby');
});

test('ConnectionStatus surfaces connecting label', () => {
  expect(renderState('connecting')).toContain('Trying to connect');
});

test('ConnectionStatus surfaces last-seen minutes', () => {
  expect(renderState('lastSeen')).toContain('3 minutes ago');
});

test('ConnectionStatus surfaces honest no-connection label', () => {
  const text = renderState('noConnection');
  expect(text).toContain('No connection');
});

test('ConnectionStatus never leaks transport terminology', () => {
  const states: ConnectionState[] = [
    'internet',
    'localConnected',
    'connecting',
    'lastSeen',
    'noConnection',
  ];
  const forbidden = ['wifi', 'p2p', 'socket', 'ttl', 'relay', 'hop'];
  for (const state of states) {
    const text = renderState(state).toLowerCase();
    for (const word of forbidden) {
      expect(text).not.toContain(word);
    }
  }
});
