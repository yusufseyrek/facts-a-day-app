import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, ExternalLink, AlertCircle } from '@tamagui/lucide-icons';

import { Text } from './Typography';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  /** Show external link icon instead of chevron (for links that open outside the app) */
  showExternalLink?: boolean;
  /** Show warning indicator (e.g., for missing permissions) */
  showWarning?: boolean;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  value,
  onPress,
  icon,
  showExternalLink = false,
  showWarning = false,
}) => {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  // Use pure white in dark mode for better contrast
  const labelColor = theme === 'dark' ? '#FFFFFF' : colors.text;
  
  // Warning indicator color - darker in light mode for better readability
  const warningColor = theme === 'dark' ? '#F59E0B' : '#B45309';

  // Use white background in light mode, surface in dark mode
  const backgroundColor =
    theme === "dark"
      ? hexColors.dark.surface
      : hexColors.light.surface;

  const styles = useMemo(() => ({
    container: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      minHeight: 56,
    },
    leftContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
    },
    iconContainer: {
      marginRight: spacing.md,
    },
    warningContainer: {
      marginLeft: spacing.sm,
    },
    rightContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
  }), [spacing, radius]);

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor: showWarning ? warningColor : colors.border,
        },
      ]}
    >
      <View style={styles.leftContent}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <Text.Label color={labelColor}>
          {label}
        </Text.Label>
        {showWarning && (
          <View style={styles.warningContainer}>
            <AlertCircle size={iconSizes.sm} color={warningColor} />
          </View>
        )}
      </View>
      <View style={styles.rightContent}>
        {value && (
          <Text.Label color={colors.textSecondary}>
            {value}
          </Text.Label>
        )}
        {onPress && (
          showExternalLink 
            ? <ExternalLink size={iconSizes.md} color={colors.textSecondary} />
            : <ChevronRight size={iconSizes.md} color={colors.textSecondary} />
        )}
      </View>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      aria-label={`${label}${value ? `, ${value}` : ''}`}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
};
