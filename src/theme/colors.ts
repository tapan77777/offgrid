// OFFGRID palette — deep charcoal foundation with restrained forest green for a
// premium, calm, outdoor-communication feel. Colour is a reinforcement of state,
// never the sole signal (see CLAUDE.md §33). Safety red is reserved for SOS.
export const palette = {
  // Neutrals — deep tinted charcoals for elevated dark UI (Linear/Superhuman feel)
  ink1000: '#07090B', // app background
  ink900: '#0E1215', // primary surface
  ink800: '#141A1E', // raised surface
  ink700: '#1B2227', // input / well
  ink600: '#232B31', // strong border
  ink500: '#2D363E', // divider
  ink400: '#4B5560', // muted foreground
  ink300: '#7B8690', // secondary foreground
  ink200: '#B6BDC5', // secondary text
  ink100: '#DDE1E6', // near-primary text
  ink50: '#F4F6F8', // primary text

  // Brand — deep forest, muted, feels natural (not tactical / not neon)
  forest900: '#152820',
  forest700: '#1F3B2E',
  forest500: '#3E7A5B',
  forest400: '#5AA37D',
  forest300: '#88C6A5',

  // Warm accent — ember. Used sparingly for "Coming soon" and highlights.
  ember500: '#C88755',
  ember400: '#D8A279',

  // Semantic
  sky500: '#5FA3CC', // internet available
  amber500: '#D6B460', // stale / connecting
  safetyGreen500: '#3E8F6B', // "I'm Safe" confirmation
  safetyRed500: '#B44341', // SOS only
  error500: '#D46461',
} as const;

export const colors = {
  background: palette.ink1000,
  surface: palette.ink900,
  surfaceRaised: palette.ink800,
  surfaceInset: palette.ink700,
  border: palette.ink600,
  borderStrong: palette.ink500,
  divider: palette.ink500,

  textPrimary: palette.ink50,
  textSecondary: palette.ink200,
  textMuted: palette.ink300,
  textFaint: palette.ink400,
  textInverse: palette.ink1000,

  brand: palette.forest500,
  brandStrong: palette.forest400,
  brandBright: palette.forest300,
  brandSoft: palette.forest900,
  brandBorder: palette.forest700,

  accent: palette.ember500,
  accentSoft: '#3A2618',

  // Semantic status colours
  statusConnected: palette.forest400,
  statusConnecting: palette.amber500,
  statusStale: palette.amber500,
  statusOffline: palette.ink400,
  statusInternet: palette.sky500,

  // Safety
  imSafe: palette.safetyGreen500,
  imSafeSoft: '#173026',
  sos: palette.safetyRed500,
  sosSoft: '#3A1B1B',

  error: palette.error500,
} as const;

export type ColorToken = keyof typeof colors;
