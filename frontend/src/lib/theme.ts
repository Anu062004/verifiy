export const COLORS = {
  light: {
    bg: "#ffffff",
    fg: "#0a0a0a",
    muted: "#71717a",
    accent: "#18181b",
    card: "#fafafa",
    border: "#e4e4e7",
    input: "#f4f4f5",
  },
  dark: {
    bg: "#0a0a0a",
    fg: "#fafafa",
    muted: "#a1a1aa",
    accent: "#fafafa",
    card: "#18181b",
    border: "#27272a",
    input: "#1f1f23",
  },
} as const;

export const FONT = {
  sans: "Inter, system-ui, -apple-system, sans-serif",
  mono: "JetBrains Mono, ui-monospace, monospace",
} as const;

export const SPACING = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
  "3xl": "64px",
  "4xl": "80px",
} as const;

export const MAX_WIDTH = "1200px";
export const SECTION_GAP = "64px";
