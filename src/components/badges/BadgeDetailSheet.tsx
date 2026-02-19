import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Check } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { XStack, YStack } from 'tamagui';

import { STAR_COLORS, type BadgeTier } from '../../config/badges';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { useResponsive } from '../../utils/useResponsive';

import { BadgeIcon } from './BadgeIcon';
import { StarRating } from './StarRating';
import { FONT_FAMILIES, Text } from '../Typography';

import type { BadgeWithStatus } from '../../services/badges';

const TIER_ORDER: BadgeTier[] = ['bronze', 'silver', 'gold'];

interface BadgeDetailSheetProps {
  badge: BadgeWithStatus | null;
  visible: boolean;
  onClose: () => void;
}

export function BadgeDetailSheet({ badge, visible, onClose }: BadgeDetailSheetProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (visible && badge) {
      setModalVisible(true);
      opacity.setValue(0);
      scale.setValue(0.9);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }),
      ]).start();
    } else if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.9, duration: 150, useNativeDriver: true }),
      ]).start(() => setModalVisible(false));
    }
  }, [visible, badge, opacity, scale]);

  const earnedTierSet = useMemo(
    () => new Set(badge?.earnedTiers.map((e) => e.tier) || []),
    [badge?.earnedTiers]
  );

  if (!badge) return null;

  const { definition, currentProgress } = badge;

  const isUnlocked = badge.earnedTiers.length > 0;
  const heroIconSize = iconSizes.heroLg * 2.5;

  const getGoalText = (threshold: number) =>
    t(`badge_${definition.id}_goal` as any, { count: String(threshold) });

  const getGuidanceText = () => {
    if (!badge.nextTier || !badge.nextThreshold) return null;
    const remaining = Math.max(0, badge.nextThreshold - currentProgress);
    const starIndex = TIER_ORDER.indexOf(badge.nextTier) + 1;
    return t('badgeStarProgress' as any, { count: String(remaining), star: String(starIndex) });
  };

  return (
    <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={{
            opacity,
            transform: [{ scale }],
            width: '88%',
            maxWidth: 380,
          }}
        >
          <Pressable>
            <YStack
              backgroundColor={colors.cardBackground}
              borderRadius={radius.xl}
              overflow="hidden"
              shadowColor="#000"
              shadowOffset={{ width: 0, height: 8 }}
              shadowOpacity={0.25}
              shadowRadius={16}
              elevation={8}
            >
              {/* Top gradient area */}
              <LinearGradient
                colors={
                  isUnlocked
                    ? [hexToRgba(STAR_COLORS.filled, 0.12), hexToRgba(STAR_COLORS.filled, 0.02)]
                    : [hexToRgba(colors.border, 0.1), 'transparent']
                }
                style={{ paddingTop: spacing.lg, paddingBottom: spacing.sm, alignItems: 'center' }}
              >
                {/* Badge icon — no ring */}
                <BadgeIcon badgeId={definition.id} size={heroIconSize} isUnlocked={isUnlocked} />
              </LinearGradient>

              <YStack padding={spacing.lg} paddingTop={spacing.md} gap={spacing.md} alignItems="center">
                {/* Name & description */}
                <YStack alignItems="center" gap={spacing.xs}>
                  <Text.Title textAlign="center" color={colors.text}>
                    {t(`badge_${definition.id}` as any)}
                  </Text.Title>
                  <Text.Caption textAlign="center" color={colors.textSecondary}>
                    {t(`badge_${definition.id}_desc` as any)}
                  </Text.Caption>
                </YStack>

                {/* Star rating */}
                <StarRating earnedCount={badge.earnedTiers.length} size={iconSizes.lg} gap={spacing.sm} />

                {/* Tier detail rows */}
                <YStack width="100%" gap={spacing.xs}>
                  {definition.tiers.map((tierDef, index) => {
                    const isEarned = earnedTierSet.has(tierDef.tier);
                    const earnedEntry = badge.earnedTiers.find((e) => e.tier === tierDef.tier);
                    const tierProgress = Math.min(currentProgress / tierDef.threshold, 1);
                    const starCount = index + 1;

                    return (
                      <XStack
                        key={tierDef.tier}
                        alignItems="center"
                        gap={spacing.sm}
                        paddingVertical={spacing.xs}
                        paddingHorizontal={spacing.sm}
                        borderRadius={radius.md}
                        backgroundColor={isEarned ? `${STAR_COLORS.filled}10` : `${colors.border}08`}
                      >
                        {/* Star indicator */}
                        <View style={{ width: iconSizes.xl + spacing.md, alignItems: 'center' }}>
                          <StarRating earnedCount={isEarned ? starCount : 0} totalStars={starCount} size={iconSizes.xs} gap={spacing.xs} />
                        </View>

                        <YStack flex={1} gap={spacing.xs}>
                          <Text.Caption
                            fontFamily={FONT_FAMILIES.semibold}
                            color={isEarned ? colors.text : colors.textSecondary}
                          >
                            {getGoalText(tierDef.threshold)}
                          </Text.Caption>

                          {/* Progress bar for unearned tiers */}
                          {!isEarned && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                              <View
                                style={{
                                  flex: 1,
                                  height: 3,
                                  backgroundColor: `${colors.border}25`,
                                  borderRadius: radius.sm,
                                  overflow: 'hidden',
                                }}
                              >
                                <View
                                  style={{
                                    width: `${tierProgress * 100}%` as any,
                                    height: '100%',
                                    backgroundColor: `${STAR_COLORS.filled}90`,
                                    borderRadius: radius.sm,
                                  }}
                                />
                              </View>
                              <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                                {currentProgress}/{tierDef.threshold}
                              </Text.Tiny>
                            </View>
                          )}
                        </YStack>

                        {/* Earned indicator */}
                        {isEarned && earnedEntry && (
                          <XStack alignItems="center" gap={spacing.xs}>
                            <Check size={iconSizes.xs} color={STAR_COLORS.filled} strokeWidth={3} />
                            <Text.Tiny color={colors.textMuted}>
                              {new Date(earnedEntry.earned_at).toLocaleDateString()}
                            </Text.Tiny>
                          </XStack>
                        )}
                      </XStack>
                    );
                  })}
                </YStack>

                {/* Guidance pill */}
                {badge.nextTier && badge.nextThreshold && (
                  <YStack
                    backgroundColor={`${STAR_COLORS.filled}10`}
                    borderWidth={1}
                    borderColor={`${STAR_COLORS.filled}20`}
                    paddingHorizontal={spacing.md}
                    paddingVertical={spacing.sm}
                    borderRadius={radius.full}
                    alignSelf="center"
                  >
                    <Text.Tiny textAlign="center" color={STAR_COLORS.filled} fontFamily={FONT_FAMILIES.medium}>
                      {getGuidanceText()}
                    </Text.Tiny>
                  </YStack>
                )}
              </YStack>
            </YStack>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
