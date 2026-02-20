import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Check, X } from '@tamagui/lucide-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { XStack, YStack } from 'tamagui';

import { STAR_COLORS } from '../../config/badges';
import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { useResponsive } from '../../utils/useResponsive';

import { BadgeIcon } from './BadgeIcon';
import { StarRating } from './StarRating';
import { FONT_FAMILIES, Text } from '../Typography';

import type { BadgeWithStatus } from '../../services/badges';

interface BadgeDetailSheetProps {
  badge: BadgeWithStatus | null;
  visible: boolean;
  onClose: () => void;
}

export function BadgeDetailSheet({ badge, visible, onClose }: BadgeDetailSheetProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { spacing, radius, iconSizes, maxModalWidth } = useResponsive();
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

  const earnedStarSet = useMemo(
    () => new Set(badge?.earnedStars.map((e) => e.star) || []),
    [badge?.earnedStars]
  );

  if (!badge) return null;

  const { definition, currentProgress } = badge;

  const isUnlocked = badge.earnedStars.length > 0;
  const heroIconSize = iconSizes.heroLg * 2.5;

  const getGoalText = (threshold: number) =>
    t(`badge_${definition.id}_goal` as any, { count: String(threshold) });

  const getGuidanceText = () => {
    if (!badge.nextStar || !badge.nextThreshold) return null;
    const remaining = Math.max(0, badge.nextThreshold - currentProgress);
    const starIndex = parseInt(badge.nextStar.replace('star', ''));
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
            maxWidth: maxModalWidth,
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
                {/* Close button */}
                <Pressable
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    top: spacing.lg,
                    right: spacing.lg,
                    width: iconSizes.lg,
                    height: iconSizes.lg,
                    borderRadius: iconSizes.lg / 2,
                    backgroundColor: `${colors.text}10`,
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <X size={iconSizes.sm} color={colors.textSecondary} />
                </Pressable>

                {/* Badge icon — gold shadow scales with stars */}
                <View
                  style={
                    isUnlocked
                      ? {
                          shadowColor: STAR_COLORS.filled,
                          shadowOffset: { width: 0, height: 4 + badge.earnedStars.length * 4 },
                          shadowOpacity: 0.35 + badge.earnedStars.length * 0.2,
                          shadowRadius: 10 + badge.earnedStars.length * 8,
                          elevation: 6 + badge.earnedStars.length * 6,
                        }
                      : detailStyles.badgeIcon
                  }
                >
                  <BadgeIcon badgeId={definition.id} size={heroIconSize} isUnlocked={isUnlocked} />
                </View>
              </LinearGradient>

              <YStack
                padding={spacing.lg}
                paddingTop={spacing.md}
                gap={spacing.md}
                alignItems="center"
              >
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
                <StarRating
                  earnedCount={badge.earnedStars.length}
                  size={iconSizes.lg}
                  gap={spacing.sm}
                />

                {/* Star detail rows */}
                <YStack width="100%" gap={spacing.xs}>
                  {definition.stars.map((starDef, index) => {
                    const isEarned = earnedStarSet.has(starDef.star);
                    const earnedEntry = badge.earnedStars.find((e) => e.star === starDef.star);
                    const starProgress = Math.min(currentProgress / starDef.threshold, 1);
                    const starCount = index + 1;

                    return (
                      <XStack
                        key={starDef.star}
                        alignItems="center"
                        gap={spacing.sm}
                        paddingVertical={spacing.sm}
                        paddingHorizontal={spacing.sm}
                        borderRadius={radius.md}
                        backgroundColor={
                          isEarned ? `${STAR_COLORS.filled}10` : `${colors.border}08`
                        }
                      >
                        {/* Left: stars right-aligned in fixed-width column */}
                        <View
                          style={{ width: (iconSizes.xs + spacing.xs) * 3, alignItems: 'flex-end' }}
                        >
                          <StarRating
                            earnedCount={isEarned ? starCount : 0}
                            totalStars={starCount}
                            size={iconSizes.xs}
                            gap={spacing.xs}
                          />
                        </View>

                        {/* Right: goal text + progress */}
                        <YStack flex={1} gap={spacing.xs}>
                          <XStack alignItems="center" gap={spacing.xs}>
                            <Text.Caption
                              fontFamily={FONT_FAMILIES.semibold}
                              color={isEarned ? colors.text : colors.textSecondary}
                              flex={1}
                            >
                              {getGoalText(starDef.threshold)}
                            </Text.Caption>
                            {isEarned && earnedEntry && (
                              <XStack alignItems="center" gap={spacing.xs}>
                                <Check
                                  size={iconSizes.xs}
                                  color={STAR_COLORS.filled}
                                  strokeWidth={3}
                                />
                                <Text.Tiny color={colors.textMuted}>
                                  {new Date(earnedEntry.earned_at).toLocaleDateString()}
                                </Text.Tiny>
                              </XStack>
                            )}
                            {!isEarned && (
                              <Text.Tiny color={colors.textMuted} fontFamily={FONT_FAMILIES.medium}>
                                {currentProgress}/{starDef.threshold}
                              </Text.Tiny>
                            )}
                          </XStack>

                          {/* Progress bar for unearned stars — full width */}
                          {!isEarned && (
                            <View
                              style={{
                                height: 3,
                                backgroundColor: `${colors.border}25`,
                                borderRadius: radius.sm,
                                overflow: 'hidden',
                              }}
                            >
                              <View
                                style={{
                                  width: `${starProgress * 100}%` as any,
                                  height: '100%',
                                  backgroundColor: `${STAR_COLORS.filled}90`,
                                  borderRadius: radius.sm,
                                }}
                              />
                            </View>
                          )}
                        </YStack>
                      </XStack>
                    );
                  })}
                </YStack>

                {/* Guidance pill */}
                {badge.nextStar && badge.nextThreshold && (
                  <YStack
                    backgroundColor={`${STAR_COLORS.filled}25`}
                    borderWidth={1}
                    borderColor={`${STAR_COLORS.filled}40`}
                    paddingHorizontal={spacing.md}
                    paddingVertical={spacing.sm}
                    borderRadius={radius.full}
                    alignSelf="center"
                  >
                    <Text.Tiny
                      textAlign="center"
                      color={STAR_COLORS.filled}
                      fontFamily={FONT_FAMILIES.semibold}
                    >
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

const detailStyles = StyleSheet.create({
  badgeIcon: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
});
