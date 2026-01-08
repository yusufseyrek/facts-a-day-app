import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { ChevronRight, ExternalLink, AlertCircle } from '@tamagui/lucide-icons';
import { useTheme } from '../theme';
import { hexColors, spacing, radius, sizes } from '../theme';
import { Text } from './Typography';
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
  const { iconSizes } = useResponsive();
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
          <Text.Body color={colors.textSecondary}>
            {value}
          </Text.Body>
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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.phone.lg,
    paddingVertical: spacing.phone.md,
    borderRadius: radius.phone.md,
    borderWidth: 1,
    minHeight: 56,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginRight: spacing.phone.md,
  },
  warningContainer: {
    marginLeft: spacing.phone.sm,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.phone.sm,
  },
});
