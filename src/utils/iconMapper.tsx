import React from 'react';
import * as LucideIcons from '@tamagui/lucide-icons';

/**
 * Convert kebab-case to PascalCase
 * Example: "book-open" -> "BookOpen"
 */
function kebabToPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

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
  if (!iconName) {
    return <LucideIcons.Lightbulb size={size} color={color} />;
  }

  // Convert kebab-case to PascalCase
  const pascalCaseName = kebabToPascalCase(iconName);

  // Get the icon component
  const IconComponent = LucideIcons[pascalCaseName as keyof typeof LucideIcons];

  if (!IconComponent || typeof IconComponent !== 'function') {
    console.warn(
      `Icon "${iconName}" (${pascalCaseName}) not found in Lucide icons. Using Lightbulb as fallback.`
    );
    return <LucideIcons.Lightbulb size={size} color={color} />;
  }

  return <IconComponent size={size} color={color} />;
}

/**
 * Type-safe Lucide icon names
 */
export type LucideIconName = keyof typeof LucideIcons;

/**
 * Check if an icon name exists in Lucide
 */
export function isValidLucideIcon(iconName: string): boolean {
  const pascalCaseName = kebabToPascalCase(iconName);
  return pascalCaseName in LucideIcons;
}
