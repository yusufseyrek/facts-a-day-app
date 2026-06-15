import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { hexColors, useTheme } from '../theme';
import { darkenColor } from '../utils/colors';
import { androidRipple } from '../utils/styles';
import { useResponsive } from '../utils/useResponsive';

import { AlertCircle, ChevronRight, ExternalLink } from './icons';
import { Text } from './Typography';

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  /** Reserved: the caller colors the icon itself; the row keeps it chrome-free. */
  accentColor?: string;
  /**
   * Grouped-card shaping: rows of a section compose into ONE plain card.
   * First/last round the outer corners; an inset hairline divides the middle.
   */
  isFirst?: boolean;
  isLast?: boolean;
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
  isFirst = false,
  isLast = false,
  showExternalLink = false,
  showWarning = false,
}) => {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes, media } = useResponsive();
  const colors = hexColors[theme];
  const isDark = theme === 'dark';

  // Pure white in dark mode for better contrast.
  const labelColor = isDark ? '#FFFFFF' : colors.text;
  const warningColor = isDark ? colors.warning : darkenColor(colors.warning, 0.25);

  // Width of the leading icon column — the inset divider lines up with the label.
  const iconColumn = iconSizes.md + spacing.md;

  const cornerRadii = {
    borderTopLeftRadius: isFirst ? radius.lg : 0,
    borderTopRightRadius: isFirst ? radius.lg : 0,
    borderBottomLeftRadius: isLast ? radius.lg : 0,
    borderBottomRightRadius: isLast ? radius.lg : 0,
  };

  const styles = useMemo(
    () => ({
      container: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        minHeight: media.buttonHeight,
      },
      leftContent: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        flex: 1,
      },
      iconWrap: {
        width: iconSizes.md,
        alignItems: 'center' as const,
        marginRight: spacing.md,
      },
      warningContainer: {
        marginLeft: spacing.sm,
      },
      rightContent: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: spacing.sm,
        marginLeft: spacing.sm,
      },
      // Inset divider aligned with the label (past the icon column).
      separator: {
        position: 'absolute' as const,
        left: spacing.lg + iconColumn,
        right: 0,
        bottom: 0,
        height: StyleSheet.hairlineWidth,
      },
    }),
    [spacing, media, iconSizes, iconColumn]
  );

  const content = (
    <View style={[styles.container, cornerRadii, { backgroundColor: colors.cardBackground }]}>
      <View style={styles.leftContent}>
        {icon && <View style={styles.iconWrap}>{icon}</View>}
        <Text.Label color={labelColor} numberOfLines={1} flexShrink={1}>
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
          <Text.Label color={colors.textSecondary} numberOfLines={1} flexShrink={1}>
            {value}
          </Text.Label>
        )}
        {onPress &&
          (showExternalLink ? (
            <ExternalLink size={iconSizes.sm} color={colors.textSecondary} />
          ) : (
            <ChevronRight size={iconSizes.sm} color={colors.textSecondary} />
          ))}
      </View>
      {!isLast && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
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
      android_ripple={androidRipple(isDark)}
      style={({ pressed }) => [
        cornerRadii,
        {
          overflow: 'hidden' as const,
          opacity: Platform.OS === 'ios' && pressed ? 0.6 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
};
