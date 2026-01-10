export const hexColors = {
  // Light Mode Colors (Tinted for glow visibility)
  light: {
    // Backgrounds - darker primary for better white text contrast
    primary: '#0077A8',
    primaryLight: '#E0F7FF',
    primaryGlow: 'rgba(0, 119, 168, 0.25)',
    neutral: '#4A6785',
    neutralLight: '#C5D8E8',
    background: '#E8F0FA',
    surface: '#F0F5FC',
    cardBackground: '#FFFFFF',
    text: '#0A1628',
    textSecondary: '#4A6785',
    textMuted: '#7A99B8',
    border: '#C5D8E8',
    borderGlow: '#0077A8',

    // Accent - darker for better contrast
    accent: '#CC5500',
    accentLight: '#FFF0E0',
    accentGlow: 'rgba(204, 85, 0, 0.2)',

    // Neon Colors - darker for better white text contrast
    neonCyan: '#0077A8',
    neonCyanGlow: 'rgba(0, 119, 168, 0.25)',
    neonOrange: '#CC5500',
    neonOrangeGlow: 'rgba(204, 85, 0, 0.2)',
    neonMagenta: '#B026B0',
    neonMagentaGlow: 'rgba(176, 38, 176, 0.2)',
    neonGreen: '#059669',
    neonGreenGlow: 'rgba(5, 150, 105, 0.2)',
    neonPurple: '#7C3AED',
    neonPurpleGlow: 'rgba(124, 58, 237, 0.2)',
    neonYellow: '#B45309',
    neonYellowGlow: 'rgba(180, 83, 9, 0.2)',
    neonRed: '#DC2626',
    neonRedGlow: 'rgba(220, 38, 38, 0.2)',

    // Semantic
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
  },
  // Dark Mode Colors (Full neon experience)
  dark: {
    // Backgrounds
    primary: '#00A3CC',
    primaryLight: '#1A3D5C',
    primaryGlow: 'rgba(0, 212, 255, 0.4)',
    neutral: '#8CA3C0',
    neutralLight: '#1E3A5F',
    background: '#0A1628',
    surface: '#0F1E36',
    cardBackground: '#142238',
    text: '#FFFFFF',
    textSecondary: '#8CA3C0',
    textMuted: '#5A7A9E',
    border: '#1E3A5F',
    borderGlow: '#00D4FF',

    // Accent
    accent: '#FF8C00',
    accentLight: '#4D3000',
    accentGlow: 'rgba(255, 140, 0, 0.4)',

    // Neon Colors (full intensity)
    neonCyan: '#00D4FF',
    neonCyanGlow: 'rgba(0, 212, 255, 0.4)',
    neonOrange: '#FF8C00',
    neonOrangeGlow: 'rgba(255, 140, 0, 0.4)',
    neonMagenta: '#FF00FF',
    neonMagentaGlow: 'rgba(255, 0, 255, 0.4)',
    neonGreen: '#00FF88',
    neonGreenGlow: 'rgba(0, 255, 136, 0.4)',
    neonPurple: '#A855F7',
    neonPurpleGlow: 'rgba(168, 85, 247, 0.4)',
    neonYellow: '#FACC15',
    neonYellowGlow: 'rgba(250, 204, 21, 0.4)',
    neonRed: '#FF4757',
    neonRedGlow: 'rgba(255, 71, 87, 0.4)',

    // Semantic
    success: '#00FF88',
    error: '#FF4757',
    warning: '#FFB800',
  },
} as const;

export type HexColors = typeof hexColors;
