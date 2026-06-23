import { useRouter } from 'expo-router';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { useResponsive } from '../../utils/useResponsive';
import { BottomSheet } from '../BottomSheet';
import { DialogButton } from '../DialogShell';
import { Crown } from '../icons';
import { XStack, YStack } from '../Stacks';
import { Text } from '../Typography';

interface RemoveAdsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Soft paywall shown when the user taps a banner's close [X] — a dismissible
 * bottom sheet offering the ad-free upgrade. "Maybe later" backs out (the banner
 * stays); "Upgrade to Premium" opens the full IAP paywall. Built on BottomSheet
 * and reuses existing paywall / settings strings, so it ships no new copy.
 */
export function RemoveAdsSheet({ visible, onClose }: RemoveAdsSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const { spacing, iconSizes } = useResponsive();

  const goToPaywall = () => {
    onClose();
    router.push('/paywall?source=ad_close');
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} showClose>
      <YStack
        paddingHorizontal={spacing.lg}
        paddingTop={spacing.xs}
        gap={spacing.md}
        alignItems="center"
      >
        <YStack
          width={iconSizes.heroLg}
          height={iconSizes.heroLg}
          borderRadius={iconSizes.heroLg / 2}
          backgroundColor={hexToRgba(colors.primary, 0.14)}
          justifyContent="center"
          alignItems="center"
        >
          <Crown size={iconSizes.lg} color={colors.primary} />
        </YStack>
        <Text.Title color={colors.text} textAlign="center">
          {t('settingsRemoveAds')}
        </Text.Title>
        <Text.Body color={colors.textSecondary} textAlign="center">
          {t('paywallFeatureNoAdsDesc')}
        </Text.Body>
      </YStack>
      <XStack paddingHorizontal={spacing.lg} paddingTop={spacing.lg} gap={spacing.md}>
        <DialogButton variant="outline" label={t('maybeLater')} onPress={onClose} />
        <DialogButton variant="solid" label={t('settingsUpgradeToPremium')} onPress={goToPaywall} />
      </XStack>
    </BottomSheet>
  );
}
