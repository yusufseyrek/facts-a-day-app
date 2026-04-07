import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Crown, Lightbulb } from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { ReadingStreakIndicator } from '../badges/ReadingStreakIndicator';
import { ScreenHeader } from '../ScreenLayout';

interface HomeHeaderProps {
  isPremium: boolean;
  streak: number;
}

export const HomeHeader = React.memo(function HomeHeader({ isPremium, streak }: HomeHeaderProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, iconSizes } = useResponsive();
  const colors = hexColors[theme];

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <ScreenHeader
        icon={
          <View style={{ position: 'relative', width: iconSizes.lg, height: iconSizes.lg }}>
            <Lightbulb position="absolute" size={iconSizes.lg} color={colors.primary} />
            {isPremium && (
              <Crown
                position="absolute"
                size={iconSizes.xs}
                color="#DAA520"
                fill="#DAA520"
                top={-iconSizes.sm / 2}
                left={iconSizes.sm / 2}
                transform={[{ rotate: '16deg' }]}
              />
            )}
          </View>
        }
        title={t('appName')}
        paddingBottom={spacing.sm}
        rightElement={
          <ReadingStreakIndicator streak={streak} onPress={() => router.push('/badges')} />
        }
      />
    </Animated.View>
  );
});
