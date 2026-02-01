// Lobster palette tokens for CLI/UI theming. "lobster seam" == use this palette.
// Keep in sync with docs/cli/index.md (CLI palette section).

// Dark theme palette (default) - bright colors for dark backgrounds
const LOBSTER_PALETTE_DARK = {
  accent: "#FF5A2D",
  accentBright: "#FF7A3D",
  accentDim: "#D14A22",
  info: "#FF8A5B",
  success: "#2FBF71",
  warn: "#FFB020",
  error: "#E23D2D",
  muted: "#8B7F77",
} as const;

// Light theme palette - darker colors for light backgrounds
const LOBSTER_PALETTE_LIGHT = {
  accent: "#C43D1A",
  accentBright: "#D14A22",
  accentDim: "#A03015",
  info: "#B35C2A",
  success: "#1A8A4A",
  warn: "#B37A00",
  error: "#B32020",
  muted: "#5A534D",
} as const;

// Select palette based on OPENCLAW_THEME env var
const isLightTheme = process.env.OPENCLAW_THEME?.toLowerCase() === "light";
export const LOBSTER_PALETTE = isLightTheme ? LOBSTER_PALETTE_LIGHT : LOBSTER_PALETTE_DARK;
