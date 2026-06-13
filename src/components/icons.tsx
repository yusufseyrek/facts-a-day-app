import React from 'react';
import { ViewStyle } from 'react-native';
import { Circle, Line, Path, Polygon, Polyline, Rect, Svg, SvgProps } from 'react-native-svg';

import { hexColors } from '../theme/hexColors';
import { useThemeName } from '../theme/ThemeProvider';
import { resolveColorToken } from '../theme/tokens';

import { STYLE_KEYS } from './Stacks';

/**
 * Vendored lucide icons (https://lucide.dev, ISC license) as plain
 * react-native-svg components — replaces @tamagui/lucide-icons, whose
 * barrel pulled ~1,760 modules and whose themed() wrapper needed the
 * Tamagui runtime. Only the icons the app uses are included.
 *
 * To add one: find it on lucide.dev, copy its SVG elements into an
 * icon() entry below (kebab-case attrs become camelCase).
 */

export type IconProps = Omit<SvgProps, 'color'> &
  Omit<ViewStyle, 'transform'> & {
    size?: number;
    color?: string;
    strokeWidth?: number | string;
  };

type IconElement = [React.ElementType, Record<string, string>];

function icon(elements: IconElement[]) {
  function Icon({ size = 24, color, strokeWidth = 2, style, ...rest }: IconProps) {
    const theme = useThemeName();
    const stroke = color ? (resolveColorToken(theme, color) ?? color) : hexColors[theme].text;
    // Tamagui icons accepted layout styles as JSX props; keep that surface.
    const styleFromProps: Record<string, unknown> = {};
    const svgProps: Record<string, unknown> = {};
    for (const key of Object.keys(rest)) {
      const value = (rest as Record<string, unknown>)[key];
      if (STYLE_KEYS.has(key)) styleFromProps[key] = value;
      else svgProps[key] = value;
    }
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...svgProps}
        style={[styleFromProps as ViewStyle, style]}
      >
        {elements.map(([El, attrs], i) => {
          const resolved: Record<string, string> = {};
          for (const key of Object.keys(attrs)) {
            resolved[key] = attrs[key] === '__COLOR__' ? stroke : attrs[key];
          }
          return <El key={i} {...resolved} />;
        })}
      </Svg>
    );
  }
  return React.memo(Icon);
}

export const Activity = icon([
  [
    Path,
    {
      d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
    },
  ],
]);

export const AlertCircle = icon([
  [Circle, { cx: '12', cy: '12', r: '10' }],
  [Line, { x1: '12', x2: '12', y1: '8', y2: '12' }],
  [Line, { x1: '12', x2: '12.01', y1: '16', y2: '16' }],
]);

export const AlertTriangle = icon([
  [Path, { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }],
  [Path, { d: 'M12 9v4' }],
  [Path, { d: 'M12 17h.01' }],
]);

export const ArrowLeft = icon([
  [Path, { d: 'm12 19-7-7 7-7' }],
  [Path, { d: 'M19 12H5' }],
]);

export const ArrowRight = icon([
  [Path, { d: 'M5 12h14' }],
  [Path, { d: 'm12 5 7 7-7 7' }],
]);

export const Award = icon([
  [
    Path,
    {
      d: 'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526',
    },
  ],
  [Circle, { cx: '12', cy: '8', r: '6' }],
]);

export const Ban = icon([
  [Circle, { cx: '12', cy: '12', r: '10' }],
  [Path, { d: 'm4.9 4.9 14.2 14.2' }],
]);

export const Banknote = icon([
  [Rect, { width: '20', height: '12', x: '2', y: '6', rx: '2' }],
  [Circle, { cx: '12', cy: '12', r: '2' }],
  [Path, { d: 'M6 12h.01M18 12h.01' }],
]);

export const BarChart3 = icon([
  [Path, { d: 'M3 3v18h18' }],
  [Path, { d: 'M18 17V9' }],
  [Path, { d: 'M13 17V5' }],
  [Path, { d: 'M8 17v-3' }],
]);

export const Bell = icon([
  [Path, { d: 'M10.268 21a2 2 0 0 0 3.464 0' }],
  [
    Path,
    {
      d: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
    },
  ],
]);

export const BookOpen = icon([
  [Path, { d: 'M12 7v14' }],
  [
    Path,
    {
      d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
    },
  ],
]);

export const Bookmark = icon([
  [Path, { d: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z' }],
]);

export const Brain = icon([
  [
    Path,
    { d: 'M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z' },
  ],
  [
    Path,
    { d: 'M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z' },
  ],
  [Path, { d: 'M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4' }],
  [Path, { d: 'M17.599 6.5a3 3 0 0 0 .399-1.375' }],
  [Path, { d: 'M6.003 5.125A3 3 0 0 0 6.401 6.5' }],
  [Path, { d: 'M3.477 10.896a4 4 0 0 1 .585-.396' }],
  [Path, { d: 'M19.938 10.5a4 4 0 0 1 .585.396' }],
  [Path, { d: 'M6 18a4 4 0 0 1-1.967-.516' }],
  [Path, { d: 'M19.967 17.484A4 4 0 0 1 18 18' }],
]);

export const Calculator = icon([
  [Rect, { width: '16', height: '20', x: '4', y: '2', rx: '2' }],
  [Line, { x1: '8', x2: '16', y1: '6', y2: '6' }],
  [Line, { x1: '16', x2: '16', y1: '14', y2: '18' }],
  [Path, { d: 'M16 10h.01' }],
  [Path, { d: 'M12 10h.01' }],
  [Path, { d: 'M8 10h.01' }],
  [Path, { d: 'M12 14h.01' }],
  [Path, { d: 'M8 14h.01' }],
  [Path, { d: 'M12 18h.01' }],
  [Path, { d: 'M8 18h.01' }],
]);

export const Calendar = icon([
  [Path, { d: 'M8 2v4' }],
  [Path, { d: 'M16 2v4' }],
  [Rect, { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
  [Path, { d: 'M3 10h18' }],
]);

export const CalendarCheck = icon([
  [Path, { d: 'M8 2v4' }],
  [Path, { d: 'M16 2v4' }],
  [Rect, { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
  [Path, { d: 'M3 10h18' }],
  [Path, { d: 'm9 16 2 2 4-4' }],
]);

export const CalendarDays = icon([
  [Path, { d: 'M8 2v4' }],
  [Path, { d: 'M16 2v4' }],
  [Rect, { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
  [Path, { d: 'M3 10h18' }],
  [Path, { d: 'M8 14h.01' }],
  [Path, { d: 'M12 14h.01' }],
  [Path, { d: 'M16 14h.01' }],
  [Path, { d: 'M8 18h.01' }],
  [Path, { d: 'M12 18h.01' }],
  [Path, { d: 'M16 18h.01' }],
]);

export const Check = icon([[Path, { d: 'M20 6 9 17l-5-5' }]]);

export const CheckCircle = icon([
  [Path, { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }],
  [Path, { d: 'm9 11 3 3L22 4' }],
]);

export const ChefHat = icon([
  [
    Path,
    {
      d: 'M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z',
    },
  ],
  [Path, { d: 'M6 17h12' }],
]);

export const ChevronLeft = icon([[Path, { d: 'm15 18-6-6 6-6' }]]);

export const ChevronRight = icon([[Path, { d: 'm9 18 6-6-6-6' }]]);

export const ChevronsUp = icon([
  [Path, { d: 'm17 11-5-5-5 5' }],
  [Path, { d: 'm17 18-5-5-5 5' }],
]);

export const Clapperboard = icon([
  [Path, { d: 'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z' }],
  [Path, { d: 'm6.2 5.3 3.1 3.9' }],
  [Path, { d: 'm12.4 3.4 3.1 4' }],
  [Path, { d: 'M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' }],
]);

export const Clock = icon([
  [Circle, { cx: '12', cy: '12', r: '10' }],
  [Polyline, { points: '12 6 12 12 16 14' }],
]);

export const Clock4 = icon([
  [Circle, { cx: '12', cy: '12', r: '10' }],
  [Polyline, { points: '12 6 12 12 16 14' }],
]);

export const Cpu = icon([
  [Path, { d: 'M12 20v2' }],
  [Path, { d: 'M12 2v2' }],
  [Path, { d: 'M17 20v2' }],
  [Path, { d: 'M17 2v2' }],
  [Path, { d: 'M2 12h2' }],
  [Path, { d: 'M2 17h2' }],
  [Path, { d: 'M2 7h2' }],
  [Path, { d: 'M20 12h2' }],
  [Path, { d: 'M20 17h2' }],
  [Path, { d: 'M20 7h2' }],
  [Path, { d: 'M7 20v2' }],
  [Path, { d: 'M7 2v2' }],
  [Rect, { x: '4', y: '4', width: '16', height: '16', rx: '2' }],
  [Rect, { x: '8', y: '8', width: '8', height: '8', rx: '1' }],
]);

export const Crown = icon([
  [
    Path,
    {
      d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
    },
  ],
  [Path, { d: 'M5 21h14' }],
]);

export const DoorOpen = icon([
  [Path, { d: 'M11 20H2' }],
  [
    Path,
    {
      d: 'M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z',
    },
  ],
  [Path, { d: 'M11 4H8a2 2 0 0 0-2 2v14' }],
  [Path, { d: 'M14 12h.01' }],
  [Path, { d: 'M22 20h-3' }],
]);

export const Dumbbell = icon([
  [
    Path,
    {
      d: 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z',
    },
  ],
  [Path, { d: 'm2.5 21.5 1.4-1.4' }],
  [Path, { d: 'm20.1 3.9 1.4-1.4' }],
  [
    Path,
    {
      d: 'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z',
    },
  ],
  [Path, { d: 'm9.6 14.4 4.8-4.8' }],
]);

export const ExternalLink = icon([
  [Path, { d: 'M15 3h6v6' }],
  [Path, { d: 'M10 14 21 3' }],
  [Path, { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
]);

export const Eye = icon([
  [
    Path,
    {
      d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
    },
  ],
  [Circle, { cx: '12', cy: '12', r: '3' }],
]);

export const Facebook = icon([
  [Path, { d: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' }],
]);

export const FileText = icon([
  [Path, { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
  [Path, { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  [Path, { d: 'M10 9H8' }],
  [Path, { d: 'M16 13H8' }],
  [Path, { d: 'M16 17H8' }],
]);

export const Fingerprint = icon([
  [Path, { d: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4' }],
  [Path, { d: 'M14 13.12c0 2.38 0 6.38-1 8.88' }],
  [Path, { d: 'M17.29 21.02c.12-.6.43-2.3.5-3.02' }],
  [Path, { d: 'M2 12a10 10 0 0 1 18-6' }],
  [Path, { d: 'M2 16h.01' }],
  [Path, { d: 'M21.8 16c.2-2 .131-5.354 0-6' }],
  [Path, { d: 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2' }],
  [Path, { d: 'M8.65 22c.21-.66.45-1.32.57-2' }],
  [Path, { d: 'M9 6.8a6 6 0 0 1 9 5.2v2' }],
]);

export const Flag = icon([
  [Path, { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' }],
  [Line, { x1: '4', x2: '4', y1: '22', y2: '15' }],
]);

export const Flame = icon([
  [
    Path,
    {
      d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
    },
  ],
]);

export const Gamepad2 = icon([
  [Line, { x1: '6', x2: '10', y1: '11', y2: '11' }],
  [Line, { x1: '8', x2: '8', y1: '9', y2: '13' }],
  [Line, { x1: '15', x2: '15.01', y1: '12', y2: '12' }],
  [Line, { x1: '18', x2: '18.01', y1: '10', y2: '10' }],
  [
    Path,
    {
      d: 'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
    },
  ],
]);

export const Gift = icon([
  [Rect, { x: '3', y: '8', width: '18', height: '4', rx: '1' }],
  [Path, { d: 'M12 8v13' }],
  [Path, { d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' }],
  [Path, { d: 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5' }],
]);

export const Globe = icon([
  [Circle, { cx: '12', cy: '12', r: '10' }],
  [Path, { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
  [Path, { d: 'M2 12h20' }],
]);

export const GraduationCap = icon([
  [
    Path,
    {
      d: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z',
    },
  ],
  [Path, { d: 'M22 10v6' }],
  [Path, { d: 'M6 12.5V16a6 3 0 0 0 12 0v-3.5' }],
]);

export const Grid = icon([
  [Rect, { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
  [Line, { x1: '3', x2: '21', y1: '9', y2: '9' }],
  [Line, { x1: '3', x2: '21', y1: '15', y2: '15' }],
  [Line, { x1: '9', x2: '9', y1: '3', y2: '21' }],
  [Line, { x1: '15', x2: '15', y1: '3', y2: '21' }],
]);

export const Hash = icon([
  [Line, { x1: '4', x2: '20', y1: '9', y2: '9' }],
  [Line, { x1: '4', x2: '20', y1: '15', y2: '15' }],
  [Line, { x1: '10', x2: '8', y1: '3', y2: '21' }],
  [Line, { x1: '16', x2: '14', y1: '3', y2: '21' }],
]);

export const Heart = icon([
  [
    Path,
    {
      d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    },
  ],
]);

export const HeartHandshake = icon([
  [
    Path,
    {
      d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    },
  ],
  [
    Path,
    {
      d: 'M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66',
    },
  ],
  [Path, { d: 'm18 15-2-2' }],
  [Path, { d: 'm15 18-2-2' }],
]);

export const HeartPulse = icon([
  [
    Path,
    {
      d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    },
  ],
  [Path, { d: 'M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27' }],
]);

export const HelpCircle = icon([
  [Circle, { cx: '12', cy: '12', r: '10' }],
  [Path, { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }],
  [Path, { d: 'M12 17h.01' }],
]);

export const Hourglass = icon([
  [Path, { d: 'M5 22h14' }],
  [Path, { d: 'M5 2h14' }],
  [Path, { d: 'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22' }],
  [Path, { d: 'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2' }],
]);

export const ImagePlus = icon([
  [Path, { d: 'M16 5h6' }],
  [Path, { d: 'M19 2v6' }],
  [Path, { d: 'M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5' }],
  [Path, { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
  [Circle, { cx: '9', cy: '9', r: '2' }],
]);

export const Instagram = icon([
  [Rect, { width: '20', height: '20', x: '2', y: '2', rx: '5', ry: '5' }],
  [Path, { d: 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' }],
  [Line, { x1: '17.5', x2: '17.51', y1: '6.5', y2: '6.5' }],
]);

export const Landmark = icon([
  [Line, { x1: '3', x2: '21', y1: '22', y2: '22' }],
  [Line, { x1: '6', x2: '6', y1: '18', y2: '11' }],
  [Line, { x1: '10', x2: '10', y1: '18', y2: '11' }],
  [Line, { x1: '14', x2: '14', y1: '18', y2: '11' }],
  [Line, { x1: '18', x2: '18', y1: '18', y2: '11' }],
  [Polygon, { points: '12 2 20 7 4 7' }],
]);

export const Leaf = icon([
  [Path, { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' }],
  [Path, { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' }],
]);

export const Lightbulb = icon([
  [
    Path,
    {
      d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    },
  ],
  [Path, { d: 'M9 18h6' }],
  [Path, { d: 'M10 22h4' }],
]);

export const Lock = icon([
  [Rect, { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
  [Path, { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
]);

export const Map = icon([
  [
    Path,
    {
      d: 'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z',
    },
  ],
  [Path, { d: 'M15 5.764v15' }],
  [Path, { d: 'M9 3.236v15' }],
]);

export const MessageCircle = icon([[Path, { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }]]);

export const Microscope = icon([
  [Path, { d: 'M6 18h8' }],
  [Path, { d: 'M3 22h18' }],
  [Path, { d: 'M14 22a7 7 0 1 0 0-14h-1' }],
  [Path, { d: 'M9 14h2' }],
  [Path, { d: 'M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z' }],
  [Path, { d: 'M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3' }],
]);

export const Moon = icon([[Path, { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]]);

export const Newspaper = icon([
  [Path, { d: 'M15 18h-5' }],
  [Path, { d: 'M18 14h-8' }],
  [
    Path,
    {
      d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2',
    },
  ],
  [Rect, { width: '8', height: '4', x: '10', y: '6', rx: '1' }],
]);

export const Palette = icon([
  [
    Path,
    {
      d: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
    },
  ],
  [Circle, { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
  [Circle, { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
  [Circle, { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
  [Circle, { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
]);

export const PartyPopper = icon([
  [Path, { d: 'M5.8 11.3 2 22l10.7-3.79' }],
  [Path, { d: 'M4 3h.01' }],
  [Path, { d: 'M22 8h.01' }],
  [Path, { d: 'M15 2h.01' }],
  [Path, { d: 'M22 20h.01' }],
  [
    Path,
    {
      d: 'm22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10',
    },
  ],
  [Path, { d: 'm22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17' }],
  [Path, { d: 'm11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7' }],
  [
    Path,
    {
      d: 'M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z',
    },
  ],
]);

export const Pause = icon([
  [Rect, { x: '14', y: '4', width: '4', height: '16', rx: '1' }],
  [Rect, { x: '6', y: '4', width: '4', height: '16', rx: '1' }],
]);

export const PawPrint = icon([
  [Circle, { cx: '11', cy: '4', r: '2' }],
  [Circle, { cx: '18', cy: '8', r: '2' }],
  [Circle, { cx: '20', cy: '16', r: '2' }],
  [
    Path,
    {
      d: 'M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z',
    },
  ],
]);

export const Plane = icon([
  [
    Path,
    {
      d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
    },
  ],
]);

export const Play = icon([[Polygon, { points: '6 3 20 12 6 21 6 3' }]]);

export const Plus = icon([
  [Path, { d: 'M5 12h14' }],
  [Path, { d: 'M12 5v14' }],
]);

export const RefreshCw = icon([
  [Path, { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
  [Path, { d: 'M21 3v5h-5' }],
  [Path, { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
  [Path, { d: 'M8 16H3v5' }],
]);

export const Rocket = icon([
  [
    Path,
    {
      d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
    },
  ],
  [
    Path,
    {
      d: 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
    },
  ],
  [Path, { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0' }],
  [Path, { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' }],
]);

export const RotateCcw = icon([
  [Path, { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
  [Path, { d: 'M3 3v5h5' }],
]);

export const ScanEye = icon([
  [Path, { d: 'M3 7V5a2 2 0 0 1 2-2h2' }],
  [Path, { d: 'M17 3h2a2 2 0 0 1 2 2v2' }],
  [Path, { d: 'M21 17v2a2 2 0 0 1-2 2h-2' }],
  [Path, { d: 'M7 21H5a2 2 0 0 1-2-2v-2' }],
  [Circle, { cx: '12', cy: '12', r: '1' }],
  [
    Path,
    {
      d: 'M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0',
    },
  ],
]);

export const Search = icon([
  [Path, { d: 'm21 21-4.34-4.34' }],
  [Circle, { cx: '11', cy: '11', r: '8' }],
]);

export const Send = icon([
  [
    Path,
    {
      d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
    },
  ],
  [Path, { d: 'm21.854 2.147-10.94 10.939' }],
]);

export const Share = icon([
  [Path, { d: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8' }],
  [Polyline, { points: '16 6 12 2 8 6' }],
  [Line, { x1: '12', x2: '12', y1: '2', y2: '15' }],
]);

export const Share2 = icon([
  [Circle, { cx: '18', cy: '5', r: '3' }],
  [Circle, { cx: '6', cy: '12', r: '3' }],
  [Circle, { cx: '18', cy: '19', r: '3' }],
  [Line, { x1: '8.59', x2: '15.42', y1: '13.51', y2: '17.49' }],
  [Line, { x1: '15.41', x2: '8.59', y1: '6.51', y2: '10.49' }],
]);

export const Shield = icon([
  [
    Path,
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
  ],
]);

export const ShieldAlert = icon([
  [
    Path,
    {
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
  ],
  [Path, { d: 'M12 8v4' }],
  [Path, { d: 'M12 16h.01' }],
]);

export const Shuffle = icon([
  [Path, { d: 'm18 14 4 4-4 4' }],
  [Path, { d: 'm18 2 4 4-4 4' }],
  [Path, { d: 'M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22' }],
  [Path, { d: 'M2 6h1.972a4 4 0 0 1 3.6 2.2' }],
  [Path, { d: 'M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45' }],
]);

export const Smartphone = icon([
  [Rect, { width: '14', height: '20', x: '5', y: '2', rx: '2', ry: '2' }],
  [Path, { d: 'M12 18h.01' }],
]);

export const Sparkles = icon([
  [
    Path,
    {
      d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
    },
  ],
  [Path, { d: 'M20 3v4' }],
  [Path, { d: 'M22 5h-4' }],
  [Path, { d: 'M4 17v2' }],
  [Path, { d: 'M5 18H3' }],
]);

export const Star = icon([
  [
    Path,
    {
      d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
    },
  ],
]);

export const Sun = icon([
  [Circle, { cx: '12', cy: '12', r: '4' }],
  [Path, { d: 'M12 2v2' }],
  [Path, { d: 'M12 20v2' }],
  [Path, { d: 'm4.93 4.93 1.41 1.41' }],
  [Path, { d: 'm17.66 17.66 1.41 1.41' }],
  [Path, { d: 'M2 12h2' }],
  [Path, { d: 'M20 12h2' }],
  [Path, { d: 'm6.34 17.66-1.41 1.41' }],
  [Path, { d: 'm19.07 4.93-1.41 1.41' }],
]);

export const Tag = icon([
  [
    Path,
    {
      d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
    },
  ],
  [Circle, { cx: '7.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
]);

export const Target = icon([
  [Circle, { cx: '12', cy: '12', r: '10' }],
  [Circle, { cx: '12', cy: '12', r: '6' }],
  [Circle, { cx: '12', cy: '12', r: '2' }],
]);

export const Telescope = icon([
  [
    Path,
    {
      d: 'm10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44',
    },
  ],
  [Path, { d: 'm13.56 11.747 4.332-.924' }],
  [Path, { d: 'm16 21-3.105-6.21' }],
  [
    Path,
    {
      d: 'M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z',
    },
  ],
  [Path, { d: 'm6.158 8.633 1.114 4.456' }],
  [Path, { d: 'm8 21 3.105-6.21' }],
  [Circle, { cx: '12', cy: '13', r: '2' }],
]);

export const TestTube = icon([
  [Path, { d: 'M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2' }],
  [Path, { d: 'M8.5 2h7' }],
  [Path, { d: 'M14.5 16h-5' }],
]);

export const Timer = icon([
  [Line, { x1: '10', x2: '14', y1: '2', y2: '2' }],
  [Line, { x1: '12', x2: '15', y1: '14', y2: '11' }],
  [Circle, { cx: '12', cy: '14', r: '8' }],
]);

export const Trash2 = icon([
  [Path, { d: 'M3 6h18' }],
  [Path, { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
  [Path, { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
  [Line, { x1: '10', x2: '10', y1: '11', y2: '17' }],
  [Line, { x1: '14', x2: '14', y1: '11', y2: '17' }],
]);

export const TrendingUp = icon([
  [Polyline, { points: '22 7 13.5 15.5 8.5 10.5 2 17' }],
  [Polyline, { points: '16 7 22 7 22 13' }],
]);

export const Trophy = icon([
  [Path, { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }],
  [Path, { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }],
  [Path, { d: 'M4 22h16' }],
  [Path, { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }],
  [Path, { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }],
  [Path, { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' }],
]);

export const Twitter = icon([
  [
    Path,
    {
      d: 'M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z',
    },
  ],
]);

export const User = icon([
  [Path, { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
  [Circle, { cx: '12', cy: '7', r: '4' }],
]);

export const Users = icon([
  [Path, { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
  [Path, { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
  [Path, { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
  [Circle, { cx: '9', cy: '7', r: '4' }],
]);

export const Utensils = icon([
  [Path, { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' }],
  [Path, { d: 'M7 2v20' }],
  [Path, { d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' }],
]);

export const WifiOff = icon([
  [Path, { d: 'M12 20h.01' }],
  [Path, { d: 'M8.5 16.429a5 5 0 0 1 7 0' }],
  [Path, { d: 'M5 12.859a10 10 0 0 1 5.17-2.69' }],
  [Path, { d: 'M19 12.859a10 10 0 0 0-2.007-1.523' }],
  [Path, { d: 'M2 8.82a15 15 0 0 1 4.177-2.643' }],
  [Path, { d: 'M22 8.82a15 15 0 0 0-11.288-3.764' }],
  [Path, { d: 'm2 2 20 20' }],
]);

export const Wrench = icon([
  [
    Path,
    {
      d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
    },
  ],
]);

export const X = icon([
  [Path, { d: 'M18 6 6 18' }],
  [Path, { d: 'm6 6 12 12' }],
]);

export const Zap = icon([
  [
    Path,
    {
      d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
    },
  ],
]);
