/**
 * Card image theme (03 §2.2.1). Palette + typeface + sizes are configurable
 * constants here. Single accent colour; high contrast for phone screens and
 * grayscale printing; never thin fonts or pastel-on-pastel.
 */
export const THEME_VERSION = 1;

export const theme = {
  width: 1080,
  height: 1350,
  background: '#FFFFFF',
  ink: '#141414',
  muted: '#5A5A5A',
  cellFill: '#F1F1F1',
  cellStroke: '#C9C9C9',
  accent: '#1D4ED8',
  accentInk: '#FFFFFF',
  headerBand: '#111111',
  fontFamily: '"LottoNoto", "LottoNotoML", sans-serif',
  gameNameSize: 56,
  taglineSize: 30,
  serialSize: 84,
  playerNameMax: 64,
  playerNameMin: 34,
  cellNumberSize: 72,
  footerSize: 28,
  smallSize: 24,
  margin: 72,
  gridGap: 20,
  cellRadius: 26,
  headerBandHeight: 210,
} as const;
