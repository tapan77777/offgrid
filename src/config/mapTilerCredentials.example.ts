// Template for `mapTilerCredentials.ts`. This file is only a reference — the
// real credentials live in `mapTilerCredentials.ts`. Do NOT put a real key
// here (this template IS checked in).
//
// To configure MapTiler locally:
//   1. Copy the shape below into `src/config/mapTilerCredentials.ts`.
//   2. Set `apiKey` to a domain-restricted MapTiler Cloud key.
//   3. Optionally change `styleId`.
//   4. Prevent accidental commits:
//         git update-index --skip-worktree src/config/mapTilerCredentials.ts

import type { MapTilerCredentials } from './mapTilerCredentials';

export const MAP_TILER_CREDENTIALS_EXAMPLE: MapTilerCredentials = {
  apiKey: 'REPLACE_WITH_YOUR_MAPTILER_API_KEY',
  styleId: 'outdoor-v2',
};
