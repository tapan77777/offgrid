// 4-based spatial scale. Use tokens instead of raw numbers in components.
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

// Minimum interactive target — Material/Apple recommend 44–48pt for accessible
// tap targets. Kept centrally so buttons and list rows stay consistent.
export const MIN_TAP_TARGET = 48;
