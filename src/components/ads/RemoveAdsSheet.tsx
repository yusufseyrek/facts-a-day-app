import { useRouter } from 'expo-router';

import { useTranslation } from '../../i18n';
import { hexColors, useTheme } from '../../theme';
import { hexToRgba } from '../../utils/colors';
import { useResponsive } from '../../utils/useResponsive';
import { DialogButton, DialogShell } from '../DialogShell';
import { Crown } from '../icons';
import { YStack } from '../Stacks';
import { Text } from '../Typography';

interface RemoveAdsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Soft paywall shown when the user taps a banner's close [X]. A small dismissible
 * dialog offering the ad-free upgrade: "Maybe later" backs out (banners stay
 * hidden for the session), "Upgrade to Premium" opens the full IAP paywall.
 *
 * Built on DialogShell (the app's dialog grammar) and reuses existing paywall /
 * settings strings, so it ships no new copy.
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
    <DialogShell
      visible={visible}
      onClose={onClose}
      showClose
      presentInWindow
      headerIcon={<Crown size={iconSizes.lg} color={colors.primary} />}
      headerIconTint={hexToRgba(colors.primary, 0.14)}
      title={t('settingsRemoveAds')}
      footer={
        <>
          <DialogButton variant="outline" label={t('maybeLater')} onPress={onClose} />
          <DialogButton
            variant="solid"
            label={t('settingsUpgradeToPremium')}
            onPress={goToPaywall}
          />
        </>
      }
    >
      <YStack paddingHorizontal={spacing.lg} paddingTop={spacing.xs} paddingBottom={spacing.lg}>
        <Text.Body color={colors.textSecondary} textAlign="center">
          {t('paywallFeatureNoAdsDesc')}
        </Text.Body>
      </YStack>
    </DialogShell>
  );
}
