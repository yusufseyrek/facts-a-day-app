import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight, ExternalLink, AlertCircle } from '@tamagui/lucide-icons';
import { useTheme } from '../theme';
import { tokens } from '../theme/tokens';

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
  const colors = tokens.color[theme];

  // Use pure white in dark mode for better contrast
  const labelColor = theme === 'dark' ? '#FFFFFF' : colors.text;
  
  // Warning indicator color - darker in light mode for better readability
  const warningColor = theme === 'dark' ? '#F59E0B' : '#B45309';

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: showWarning ? warningColor : colors.border,
        },
      ]}
    >
      <View style={styles.leftContent}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <Text style={[styles.label, { color: labelColor }]}>
          {label}
        </Text>
        {showWarning && (
          <View style={styles.warningContainer}>
            <AlertCircle size={16} color={warningColor} />
          </View>
        )}
      </View>
      <View style={styles.rightContent}>
        {value && (
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            {value}
          </Text>
        )}
        {onPress && (
          showExternalLink 
            ? <ExternalLink size={18} color={colors.textSecondary} />
            : <ChevronRight size={20} color={colors.textSecondary} />
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
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    minHeight: 56,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    marginRight: tokens.space.md,
  },
  label: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.medium,
    fontFamily: 'Montserrat_600SemiBold',
  },
  warningContainer: {
    marginLeft: tokens.space.sm,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
  },
  value: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.regular,
    fontFamily: 'Montserrat_400Regular',
  },
});
