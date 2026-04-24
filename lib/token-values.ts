export const COLORS = {
  base: '#030a16',
  deep: '#010409',
  cyber: '#00f2ff',
  panel: '#09172d',
  panelSoft: '#12243f',
  panelDeep: '#07172d',
  panelInset: '#0b1b33',
  line: '#1c3358',
  lineSoft: '#17355f',
  lineMedium: '#21406d',
  lineBright: '#28508b',
  text: '#edf4ff',
  textSoft: '#9cb7e1',
  textHighlight: '#8ab1ff',
  muted: '#8ea4c8',
  dim: '#64779c',
  accent: '#1e6dff',
  accentStrong: '#1556d6',
  profit: '#1ec995',
  warn: '#f5b942',
  error: '#ff8f8f',
  surface: '#172338',
  hover: '#1a3158',
  cardOverlay: 'rgba(0,0,0,0.58)',
  black: '#000000',
  white: '#ffffff',
} as const;

export const SPACING_SCALE = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80] as const;

export const SPACE = {
  2: 2,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
  64: 64,
  80: 80,
} as const;

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  panel: 24,
  card: 32,
  pill: 999,
} as const;

export const GRID = {
  phone: {
    columns: 4,
    margin: SPACE[16],
    gutter: SPACE[8],
  },
  tablet: {
    columns: 8,
    margin: SPACE[24],
    gutter: SPACE[16],
  },
  desktop: {
    columns: 8,
    margin: SPACE[32],
    gutter: SPACE[16],
  },
  wideDesktop: {
    columns: 12,
    margin: SPACE[40],
    gutter: SPACE[20],
  },
} as const;

export const FONT_FAMILY = {
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: 'SpaceMono',
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  accent: 'Outfit_700Bold',
} as const;

export const TYPE = {
  display: {
    fontFamily: FONT_FAMILY.display,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: 0,
    fontWeight: '800',
  },
  h1: {
    fontFamily: FONT_FAMILY.bodyBold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 0,
    fontWeight: '700',
  },
  h2: {
    fontFamily: FONT_FAMILY.bodyBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0,
    fontWeight: '700',
  },
  h3: {
    fontFamily: FONT_FAMILY.bodyBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: 0,
    fontWeight: '700',
  },
  body: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0,
    fontWeight: '400',
  },
  bodySmall: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
    fontWeight: '400',
  },
  caption: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
    fontWeight: '400',
  },
  label: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1,
    fontWeight: '700',
  },
} as const;
