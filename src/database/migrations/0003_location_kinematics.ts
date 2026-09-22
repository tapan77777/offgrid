import type { Migration } from './types';

// Additive, non-destructive: extends the existing `locations` table with
// motion fields the roadmap needs (docs §15 conceptual schema listed
// lat/lng/accuracy/altitude only). `heading` is bearing in degrees 0..360
// clockwise from true north; `speed` is metres per second. Both nullable
// because Android's LocationManager does not always populate them.
const statements: readonly string[] = [
  'ALTER TABLE locations ADD COLUMN heading REAL',
  'ALTER TABLE locations ADD COLUMN speed REAL',
];

export const locationKinematics: Migration = {
  version: 3,
  name: '0003_location_kinematics',
  statements,
};
