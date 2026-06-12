import { useEffect } from 'react';

import { hexColors } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { DialogButton, DialogShell } from './DialogShell';
import { Heart, MessageCircle } from './icons';
import { YStack } from './Stacks';
import { Text } from './Typography';

interface SatisfactionModalProps {
  visible: boolean;
  onLoveIt: () => void;
  onNotReally: () => void;
  onDismiss: () => void;
  onShow?: () => void;
  isDark: boolean;
  title: string;
  subtitle: string;
  loveItText: string;
  notReallyText: string;
}

export function SatisfactionModal({
  visible,
  onLoveIt,
  onNotReally,
  onDismiss,
  onShow,
  isDark,
  title,
  subtitle,
  loveItText,
  notReallyText,
}: SatisfactionModalProps) {
  const { maxModalWidth, spacing, iconSizes } = useResponsive();

  const textColor = isDark ? '#FFFFFF' : hexColors.light.text;
  const secondaryTextColor = isDark ? hexColors.dark.textSecondary : hexColors.light.textSecondary;

  const heartColor = isDark ? '#FF6B8A' : '#E8476C';
  const heartBgColor = isDark ? 'rgba(255, 107, 138, 0.15)' : 'rgba(232, 71, 108, 0.1)';

  // Preserve the old <Modal onShow> callback (InlineOverlay has no onShow).
  useEffect(() => {
    if (visible) onShow?.();
  }, [visible, onShow]);

  return (
    <DialogShell
      visible={visible}
      onClose={onDismiss}
      headerIcon={
        <Heart size={iconSizes.xl} color={heartColor} strokeWidth={2} fill={heartColor} />
      }
      headerIconTint={heartBgColor}
      title={title}
      showClose
      maxWidth={maxModalWidth}
      footer={
        <>
          <DialogButton
            label={notReallyText}
            onPress={onNotReally}
            variant="outline"
            icon={<MessageCircle size={iconSizes.sm} color={textColor} />}
          />
          <DialogButton
            label={loveItText}
            onPress={onLoveIt}
            icon={<Heart size={iconSizes.sm} color="#FFFFFF" />}
          />
        </>
      }
    >
      {/* Subtitle */}
      <YStack paddingHorizontal={spacing.lg} paddingVertical={spacing.lg} alignItems="center">
        <Text.Body color={secondaryTextColor} textAlign="center">
          {subtitle}
        </Text.Body>
      </YStack>
    </DialogShell>
  );
}
