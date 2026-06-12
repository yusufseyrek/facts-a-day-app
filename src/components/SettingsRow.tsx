import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { hexColors, useTheme } from '../theme';
import { androidRipple } from '../utils/styles';
import { useResponsive } from '../utils/useResponsive';

import { AlertCircle, ChevronRight, ExternalLink } from './icons';
import { Text } from './Typography';

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  /**
   * Accent behind the icon: the chip fills with the accent at low alpha
   * (same `${color}20` treatment as the trivia history session chips). The
   * icon itself should be colored with the accent by the caller.
   */
  accentColor?: string;
  /**
   * Grouped-card shaping: rows of a section compose into ONE inset card.
   * First/last control the outer radii and top/bottom hairlines; middle rows
   * draw only the side hairlines plus an inset separator.
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
  accentColor,
  isFirst = false,
  isLast = false,
  showExternalLink = false,
  showWarning = false,
}) => {
  const { theme } = useTheme();
  const { spacing, radius, iconSizes, media } = useResponsive();
  const colors = hexColors[theme];

  // Use pure white in dark mode for better contrast
  const labelColor = theme === 'dark' ? '#FFFFFF' : colors.text;

  // Warning indicator color - darker in light mode for better readability
  const warningColor = theme === 'dark' ? '#F59E0B' : '#B45309';

  const chipAccent = accentColor ?? colors.textSecondary;
  // Same proven chip sizing as the trivia history session cards.
  const chipSize = media.topicCardSize * 0.5;

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
        minHeight: 56,
      },
      leftContent: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        flex: 1,
      },
      chip: {
        width: chipSize,
        height: chipSize,
        borderRadius: radius.sm,
        justifyContent: 'center' as const,
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
      },
      // Inset separator aligned with the label (past the chip), Apple-style.
      separator: {
        position: 'absolute' as const,
        left: spacing.lg + chipSize + spacing.md,
        right: 0,
        bottom: 0,
        height: StyleSheet.hairlineWidth,
      },
    }),
    [spacing, radius, chipSize]
  );

  const content = (
    <View
      style={[
        styles.container,
        cornerRadii,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.border,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderTopWidth: isFirst ? 1 : 0,
          borderBottomWidth: isLast ? 1 : 0,
        },
      ]}
    >
      <View style={styles.leftContent}>
        {icon && <View style={[styles.chip, { backgroundColor: `${chipAccent}20` }]}>{icon}</View>}
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
        {value && <Text.Label color={colors.textSecondary}>{value}</Text.Label>}
        {onPress &&
          (showExternalLink ? (
            <ExternalLink size={iconSizes.md} color={colors.textSecondary} />
          ) : (
            <ChevronRight size={iconSizes.md} color={colors.textSecondary} />
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
      android_ripple={androidRipple(theme === 'dark')}
      style={({ pressed }) => [
        cornerRadii,
        {
          // Radii + clip on the Pressable so the Android ripple follows the
          // group card's rounded corners. iOS keeps the opacity dim; Android
          // gets the ripple only (no double feedback).
          overflow: 'hidden' as const,
          opacity: Platform.OS === 'ios' && pressed ? 0.7 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
};
