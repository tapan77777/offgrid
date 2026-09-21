/**
 * Button smoke test — renders each variant + honours disabled state.
 * Uses accessibility role to find the pressable, which is more portable
 * across RN's jest-preset mock surface than findByType(Pressable).
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Button, type ButtonVariant } from '../../src/components/Button';

function render(variant: ButtonVariant, disabled = false) {
  const onPress = jest.fn();
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <Button
        label={variant}
        variant={variant}
        onPress={onPress}
        disabled={disabled}
      />,
    );
  });
  return { tree: tree!, onPress };
}

function findButton(tree: ReactTestRenderer.ReactTestRenderer) {
  const matches = tree.root.findAll(
    node => node.props?.accessibilityRole === 'button',
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0]!;
}

test('Button renders all variants', () => {
  const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
  for (const v of variants) {
    const { tree } = render(v);
    expect(findButton(tree)).toBeTruthy();
  }
});

test('Button ignores press when disabled', () => {
  const { tree, onPress } = render('primary', true);
  const pressable = findButton(tree);
  const handler = pressable.props.onPress;
  if (typeof handler === 'function') handler();
  expect(onPress).not.toHaveBeenCalled();
});

test('Button invokes onPress when enabled', () => {
  const { tree, onPress } = render('primary', false);
  const pressable = findButton(tree);
  const handler = pressable.props.onPress;
  if (typeof handler === 'function') handler();
  expect(onPress).toHaveBeenCalledTimes(1);
});
