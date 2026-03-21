/**
 * Clerk `appearance.variables` for SignIn — aligned with SpeechBridge surfaces.
 * Uses current color-scheme tokens (dark matches index.css prefers-color-scheme: dark).
 */

export const clerkSignInVariablesDark = {
  colorBackground: "#1e2028",
  colorForeground: "#f3f4f6",
  colorMutedForeground: "#9ca3af",
  colorMuted: "#252730",
  colorInput: "#13141a",
  colorInputForeground: "#f3f4f6",
  colorBorder: "#3a3d4a",
  /* Lighter neutral so Clerk-derived secondary / OAuth text isn’t near-black on dark */
  colorNeutral: "#8b93a7",
  colorPrimary: "#a78bfa",
  colorPrimaryForeground: "#0c0b12",
  colorDanger: "#f87171",
  colorSuccess: "#34d399",
  colorWarning: "#fbbf24",
  colorRing: "rgba(192, 132, 252, 0.45)",
  colorShadow: "rgba(0, 0, 0, 0.5)",
  colorModalBackdrop: "rgba(10, 10, 14, 0.65)",
  borderRadius: "clamp(0.75rem, 1.5vw, 1.125rem)",
  fontFamily: "system-ui, sans-serif",
  spacing: "clamp(1rem, 1.2vw, 1.35rem)",
};

export const clerkSignInVariablesLight = {
  colorBackground: "#f4f4f6",
  colorForeground: "#111827",
  colorMutedForeground: "#6b7280",
  colorMuted: "#e8e8ec",
  colorInput: "#ffffff",
  colorInputForeground: "#111827",
  colorBorder: "#d1d5db",
  colorNeutral: "#6b7280",
  colorPrimary: "#7c3aed",
  colorPrimaryForeground: "#ffffff",
  colorDanger: "#dc2626",
  colorSuccess: "#059669",
  colorWarning: "#d97706",
  colorRing: "rgba(124, 58, 237, 0.35)",
  colorShadow: "rgba(15, 23, 42, 0.12)",
  colorModalBackdrop: "rgba(15, 23, 42, 0.35)",
  borderRadius: "clamp(0.75rem, 1.5vw, 1.125rem)",
  fontFamily: "system-ui, sans-serif",
  spacing: "clamp(1rem, 1.2vw, 1.35rem)",
};
