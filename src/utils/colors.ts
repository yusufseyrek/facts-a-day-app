const parseHex = (hexColor: string): [number, number, number] | null => {
  const hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16),
    ];
  }
  return null;
};

const toHex = (r: number, g: number, b: number): string =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

export const hexToRgba = (hexColor: string, opacity: number): string => {
  const rgb = parseHex(hexColor);
  if (!rgb) return `rgba(128, 128, 128, ${opacity})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
};

export const darkenColor = (hex: string, amount: number): string => {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return toHex(
    Math.round(rgb[0] * (1 - amount)),
    Math.round(rgb[1] * (1 - amount)),
    Math.round(rgb[2] * (1 - amount)),
  );
};

/**
 * Blends a foreground hex color at a given opacity onto a background hex color,
 * returning an opaque hex result. Useful on Android where semi-transparent
 * backgrounds combined with elevation cause a visible outline artifact.
 */
export const blendHexColors = (fgHex: string, bgHex: string, opacity: number): string => {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return fgHex;
  return toHex(
    Math.round(fg[0] * opacity + bg[0] * (1 - opacity)),
    Math.round(fg[1] * opacity + bg[1] * (1 - opacity)),
    Math.round(fg[2] * opacity + bg[2] * (1 - opacity)),
  );
};

export const getContrastColor = (hexColor: string): string => {
  const rgb = parseHex(hexColor);
  if (!rgb) return '#FFFFFF';
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};
