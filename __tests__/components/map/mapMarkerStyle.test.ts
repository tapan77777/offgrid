import {
  describeVariant,
  getMarkerInitial,
  getMarkerStyle,
} from '../../../src/components/map/mapMarkerStyle';

// Marker style tests: guarantee that current/stale variants render
// distinctly. The "stale" flag drives visual differentiation between fresh
// and last-known positions (D-023). Coupling ends here — the renderer only
// consumes the returned tokens.

test('getMarkerStyle: current variants are marked not-stale', () => {
  expect(getMarkerStyle('self-current').stale).toBe(false);
  expect(getMarkerStyle('peer-current').stale).toBe(false);
});

test('getMarkerStyle: stale variants are marked stale', () => {
  expect(getMarkerStyle('self-stale').stale).toBe(true);
  expect(getMarkerStyle('peer-stale').stale).toBe(true);
});

test('getMarkerStyle: self current and peer current use distinct colours', () => {
  const self = getMarkerStyle('self-current');
  const peer = getMarkerStyle('peer-current');
  expect(self.fill).not.toBe(peer.fill);
});

test('getMarkerStyle: current and stale use distinct border colours', () => {
  expect(getMarkerStyle('self-current').border).not.toBe(
    getMarkerStyle('self-stale').border,
  );
  expect(getMarkerStyle('peer-current').border).not.toBe(
    getMarkerStyle('peer-stale').border,
  );
});

test('describeVariant: labels distinguish current from last-known', () => {
  expect(describeVariant('self-current')).toMatch(/current/);
  expect(describeVariant('self-stale')).toMatch(/last-known/);
  expect(describeVariant('peer-current')).toMatch(/current/);
  expect(describeVariant('peer-stale')).toMatch(/last-known/);
});

test('getMarkerInitial: uppercases first character, falls back to ?', () => {
  expect(getMarkerInitial('alpha')).toBe('A');
  expect(getMarkerInitial('  bravo')).toBe('B');
  expect(getMarkerInitial('')).toBe('?');
  expect(getMarkerInitial('   ')).toBe('?');
});
