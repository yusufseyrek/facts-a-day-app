/**
 * Converts a hex color to rgba with the specified opacity.
 * @param hexColor The hex color string (e.g. "#FFFFFF", "#000000", "FFF")
 * @param opacity The opacity value between 0 and 1
 * @returns rgba string (e.g. "rgba(255, 255, 255, 0.2)")
 */
export const hexToRgba = (hexColor: string, opacity: number): string => {
  const hex = hexColor.replace('#', '');

  let r: number, g: number, b: number;

  if (hex.length === 3) {
    r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
    g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
    b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return `rgba(128, 128, 128, ${opacity})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/**
 * Calculates the luminance of a hex color and returns black or white for best contrast.
 * @param hexColor The hex color string (e.g. "#FFFFFF", "#000000", "FFF")
 * @returns "#000000" for dark text or "#FFFFFF" for light text
 */
/**
 * Darkens a hex color by the specified amount.
 * @param hex The hex color string (e.g. "#FF6600")
 * @param amount A value between 0 and 1 (e.g. 0.25 = 25% darker)
 * @returns Darkened hex color string
 */
export const darkenColor = (hex: string, amount: number): string => {
  const cleaned = hex.replace('#', '');

  let r: number, g: number, b: number;

  if (cleaned.length === 3) {
    r = parseInt(cleaned.charAt(0) + cleaned.charAt(0), 16);
    g = parseInt(cleaned.charAt(1) + cleaned.charAt(1), 16);
    b = parseInt(cleaned.charAt(2) + cleaned.charAt(2), 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.substring(0, 2), 16);
    g = parseInt(cleaned.substring(2, 4), 16);
    b = parseInt(cleaned.substring(4, 6), 16);
  } else {
    return hex;
  }

  r = Math.round(r * (1 - amount));
  g = Math.round(g * (1 - amount));
  b = Math.round(b * (1 - amount));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

export const getContrastColor = (hexColor: string): string => {
  // Remove hash if present
  const hex = hexColor.replace('#', '');

  // Parse RGB
  let r: number, g: number, b: number;

  if (hex.length === 3) {
    r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
    g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
    b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    // Fallback to white if invalid hex
    return '#FFFFFF';
  }

  // Calculate relative luminance using sRGB formula
  // L = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // If background is light (luminance > 0.5), use black text
  // Using 0.5 as threshold, can be adjusted (often 128/255 or ~0.5)
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};
