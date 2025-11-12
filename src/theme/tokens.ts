export const tokens = {
  color: {
    // Light Mode Colors
    light: {
      primary: "#0066FF",
      primaryLight: "#E6F0FF",
      neutral: "#647488",
      neutralLight: "#E2E8F0",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      cardBackground: "#FFFFFF",
      text: "#1A1D2E",
      textSecondary: "#647488",
      border: "#E2E8F0",
      success: "#10B981",
      error: "#EF4444",
    },
    // Dark Mode Colors
    dark: {
      primary: "#0066FF",
      primaryLight: "#1A3A66",
      neutral: "#8892A6",
      neutralLight: "#404756",
      background: "#0F1419",
      surface: "#1A1D2E",
      cardBackground: "#1A1D2E",
      text: "#FFFFFF",
      textSecondary: "#8892A6",
      border: "#2D3748",
      success: "#10B981",
      error: "#EF4444",
    },
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  size: {
    buttonHeight: 56,
    topicCardSize: 80,
    colorSwatchSize: 72,
    toggleSize: 24,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  fontSize: {
    // Numeric tokens (required by Tamagui components)
    1: 12,
    2: 14,
    3: 16,
    4: 18,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    // Named tokens (semantic usage)
    h1: 24,
    h2: 18,
    body: 14,
    label: 14,
    small: 12,
  },
  fontWeight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
} as const;

export type Tokens = typeof tokens;
