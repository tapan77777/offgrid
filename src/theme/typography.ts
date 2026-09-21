import type { TextStyle } from 'react-native';
import { colors } from './colors';

// Scalable text roles. `allowFontScaling` is left to RN's default (true) so
// device-level accessibility text size continues to work — components must
// not disable it.
export const typography = {
  displayLarge: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.textPrimary,
  } satisfies TextStyle,
  displayMedium: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  } satisfies TextStyle,
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.textPrimary,
  } satisfies TextStyle,
  overline: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.textFaint,
  } satisfies TextStyle,
  sectionHeader: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  } satisfies TextStyle,
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.textPrimary,
  } satisfies TextStyle,
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.textPrimary,
  } satisfies TextStyle,
  bodySecondary: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: colors.textSecondary,
  } satisfies TextStyle,
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: colors.textMuted,
  } satisfies TextStyle,
  buttonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  } satisfies TextStyle,
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  } satisfies TextStyle,
  mono: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Courier',
    color: colors.textSecondary,
  } satisfies TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;
