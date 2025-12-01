import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from '@tamagui/lucide-icons';
import { useTheme } from '../theme';
import { tokens } from '../theme/tokens';

interface SettingsRowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  value,
  onPress,
  icon,
}) => {
  const { theme } = useTheme();
  const colors = tokens.color[theme];

  // Use pure white in dark mode for better contrast
  const labelColor = theme === 'dark' ? '#FFFFFF' : colors.text;

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.leftContent}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <Text style={[styles.label, { color: labelColor }]}>
          {label}
        </Text>
      </View>
      <View style={styles.rightContent}>
        {value && (
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            {value}
          </Text>
        )}
        {onPress && <ChevronRight size={20} color={colors.textSecondary} />}
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
