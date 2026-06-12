import React from 'react';

import {
  Activity,
  Award,
  Banknote,
  Bookmark,
  BookOpen,
  Brain,
  Calculator,
  Calendar,
  CalendarCheck,
  CheckCircle,
  ChefHat,
  Clapperboard,
  Clock,
  Cpu,
  Dumbbell,
  Fingerprint,
  Flame,
  Gamepad2,
  Globe,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Landmark,
  Leaf,
  Lightbulb,
  Map as MapIcon,
  MessageCircle,
  Microscope,
  Palette,
  PawPrint,
  Plane,
  Rocket,
  ScanEye,
  Search,
  Share2,
  ShieldAlert,
  Shuffle,
  Tag,
  Telescope,
  TrendingUp,
  Trophy,
  Users,
  Utensils,
  Wrench,
  Zap,
} from '../components/icons';

type IconComponent = typeof Lightbulb;

/**
 * Every icon name the app can receive at runtime, keyed by the kebab-case
 * names used in data: backend `categories.icon`, onboarding questions,
 * badge definitions, and trivia mode badges.
 *
 * This used to be `import * as LucideIcons` with a kebab→Pascal lookup,
 * which pulled all ~1,760 icon modules into every bundle (Metro doesn't
 * tree-shake in dev). Unknown names fall back to Lightbulb with a warning;
 * when the backend adds a category with a new icon, add it here.
 */
const ICON_MAP = {
  activity: Activity,
  award: Award,
  banknote: Banknote,
  'book-open': BookOpen,
  bookmark: Bookmark,
  brain: Brain,
  calculator: Calculator,
  calendar: Calendar,
  'calendar-check': CalendarCheck,
  'check-circle': CheckCircle,
  'chef-hat': ChefHat,
  clapperboard: Clapperboard,
  clock: Clock,
  cpu: Cpu,
  dumbbell: Dumbbell,
  fingerprint: Fingerprint,
  flame: Flame,
  'gamepad-2': Gamepad2,
  globe: Globe,
  'graduation-cap': GraduationCap,
  'heart-handshake': HeartHandshake,
  'heart-pulse': HeartPulse,
  landmark: Landmark,
  leaf: Leaf,
  lightbulb: Lightbulb,
  map: MapIcon,
  'message-circle': MessageCircle,
  microscope: Microscope,
  palette: Palette,
  'paw-print': PawPrint,
  plane: Plane,
  rocket: Rocket,
  'scan-eye': ScanEye,
  search: Search,
  'share-2': Share2,
  'shield-alert': ShieldAlert,
  shuffle: Shuffle,
  tag: Tag,
  telescope: Telescope,
  'trending-up': TrendingUp,
  trophy: Trophy,
  users: Users,
  utensils: Utensils,
  wrench: Wrench,
  zap: Zap,
} satisfies Record<string, IconComponent>;

/**
 * Get a Lucide icon component by its kebab-case name
 * @param iconName - Icon name in kebab-case (e.g., "book-open")
 * @param size - Icon size (default: 32)
 * @param color - Optional icon color
 * @returns React element of the icon, or Lightbulb as fallback
 */
export function getLucideIcon(
  iconName: string | undefined,
  size = 32,
  color?: string
): React.ReactElement {
  const IconComponent = iconName
    ? (ICON_MAP as Record<string, IconComponent>)[iconName]
    : undefined;

  if (iconName && !IconComponent) {
    console.warn(`Icon "${iconName}" not in ICON_MAP. Using Lightbulb as fallback.`);
  }

  const Icon = IconComponent ?? Lightbulb;
  return <Icon size={size} color={color} />;
}

/**
 * Type-safe Lucide icon names
 */
export type LucideIconName = keyof typeof ICON_MAP;
