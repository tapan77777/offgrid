// Build-time UI flags.
//
// DIAGNOSTICS_UI_ENABLED gates the __DEV__-style "Open diagnostics" entry on
// HomeScreen. It stays `true` through the pre-consumer phases (Phase 3 wifi
// direct prototype, Phase 4 relay experiment) so physical-test release APKs
// can reach the DiagnosticsScreen without Metro attached. Flip to
// `__DEV__` (or drop entirely) before the first consumer release.
export const DIAGNOSTICS_UI_ENABLED = true;
