import { hexColors } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { DialogButton, DialogShell } from '../DialogShell';
import { AlertTriangle, DoorOpen } from '../icons';
import { XStack, YStack } from '../Stacks';
import { Text } from '../Typography';

interface TriviaExitModalProps {
  visible: boolean;
  onCancel: () => void;
  onExit: () => void;
  isDark: boolean;
  title: string;
  message: string;
  cancelText: string;
  exitText: string;
}

export function TriviaExitModal({
  visible,
  onCancel,
  onExit,
  isDark,
  title,
  message,
  cancelText,
  exitText,
}: TriviaExitModalProps) {
  const { spacing, radius, iconSizes } = useResponsive();

  const colors = isDark ? hexColors.dark : hexColors.light;

  // Warning colors - amber/orange tones
  const warningColor = isDark ? '#FBBF24' : '#F59E0B';
  const warningBgColor = isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(245, 158, 11, 0.1)';

  return (
    <DialogShell
      visible={visible}
      onClose={onCancel}
      // Lighter-than-default dim: keep the game clearly visible through the
      // Liquid Glass behind the exit dialog.
      dimOverride={isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)'}
      headerIcon={<AlertTriangle size={iconSizes.xl} color={warningColor} strokeWidth={2} />}
      headerIconTint={warningBgColor}
      title={title}
      showClose
      closeTestID="trivia-exit-cancel-x"
      footer={
        <>
          <DialogButton
            label={cancelText}
            onPress={onCancel}
            variant="outline"
            testID="trivia-exit-cancel"
            accessibilityLabel={cancelText}
          />
          <DialogButton
            label={exitText}
            onPress={onExit}
            variant="destructive"
            icon={<DoorOpen size={iconSizes.sm} color="#FFFFFF" />}
            testID="trivia-exit-confirm"
            accessibilityLabel={exitText}
          />
        </>
      }
    >
      {/* Message Box */}
      <YStack paddingHorizontal={spacing.lg} paddingVertical={spacing.lg}>
        <XStack
          backgroundColor={colors.surface}
          borderRadius={radius.md}
          padding={spacing.md}
          alignItems="center"
          gap={spacing.sm}
        >
          <DoorOpen size={iconSizes.lg} margin={spacing.xs} color={colors.error} />
          <Text.Body flex={1} color={colors.textSecondary}>
            {message}
          </Text.Body>
        </XStack>
      </YStack>
    </DialogShell>
  );
}
