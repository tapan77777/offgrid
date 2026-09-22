// A fix older than this age is treated as "last known" instead of "current"
// (D-023: distinguish current / last-known / unknown / sharing-disabled).
// 60s is a first pass — tuned as UX evolves.
export const LOCATION_STALE_MS = 60_000;

// Default single-shot GPS timeout on the JS side. The native module has its
// own default; JS may pass a shorter one for a snappier developer UX.
export const DEFAULT_GET_LOCATION_TIMEOUT_MS = 20_000;
