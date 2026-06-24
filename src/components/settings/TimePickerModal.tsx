import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, View } from 'react-native';

import DateTimePicker from '@react-native-community/datetimepicker';

import { useTranslation } from '../../i18n/useTranslation';
import { trackNotificationTimeChange, updateNotificationProperty } from '../../services/analytics';
import * as notificationService from '../../services/notifications';
import * as onboardingService from '../../services/onboarding';
import { hexColors, useTheme } from '../../theme';
import { useResponsive } from '../../utils/useResponsive';
import { DialogButton, DialogShell } from '../DialogShell';
import { AlertTriangle, Plus, Trash2 } from '../icons';
import { SuccessToast } from '../SuccessToast';
import { FONT_FAMILIES, Text } from '../Typography';

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  currentTime: Date;
  onTimeChange?: (time: Date) => void; // Made optional
  /** Whether notification permission is granted */
  hasNotificationPermission?: boolean;
}

export const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible,
  onClose,
  currentTime,
  onTimeChange,
  hasNotificationPermission = true,
}) => {
  const { theme } = useTheme();
  const colors = hexColors[theme];
  const { t, locale } = useTranslation();
  const { spacing, radius, iconSizes, maxModalWidth, screenHeight } = useResponsive();

  // Warning color - darker in light mode for better readability
  const warningColor = theme === 'dark' ? '#F59E0B' : '#B45309';

  // Support multiple notification times (up to 3 per day)
  const [times, setTimes] = useState<Date[]>([currentTime]);
  const [originalTimes, setOriginalTimes] = useState<Date[]>([]);
  const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Load saved times on mount
  useEffect(() => {
    if (visible) {
      loadSavedTimes();
    }
  }, [visible]);

  const loadSavedTimes = async () => {
    try {
      const savedTimes = await onboardingService.getNotificationTimes();

      if (savedTimes && savedTimes.length > 0) {
        const parsedTimes = savedTimes.map((t) => new Date(t));
        setTimes(parsedTimes);
        setOriginalTimes(parsedTimes);
      } else {
        // Default to single time
        setTimes([currentTime]);
        setOriginalTimes([currentTime]);
      }
    } catch (error) {
      console.error('Error loading saved times:', error);
      setTimes([currentTime]);
      setOriginalTimes([currentTime]);
    }
  };

  // Check if times have changed (compare hours and minutes only)
  const hasTimesChanged = (): boolean => {
    if (times.length !== originalTimes.length) {
      return true;
    }

    for (let i = 0; i < times.length; i++) {
      const current = times[i];
      const original = originalTimes[i];
      if (
        current.getHours() !== original.getHours() ||
        current.getMinutes() !== original.getMinutes()
      ) {
        return true;
      }
    }

    return false;
  };

  const handleTimeChange = (index: number, event: any, date?: Date) => {
    // On Android, hide the picker when user confirms or cancels
    if (Platform.OS === 'android') {
      setActivePickerIndex(null);
      // Only update time if user confirmed (not cancelled)
      if (event.type === 'set' && date) {
        const newTimes = [...times];
        newTimes[index] = date;
        setTimes(newTimes);
      }
    } else {
      // On iOS with spinner display, onChange fires continuously as user scrolls
      // No need to check event.type - just update when we have a valid date
      if (date) {
        const newTimes = [...times];
        newTimes[index] = date;
        setTimes(newTimes);
      }
    }
  };

  // Limits are declarative: the add button hides at 3 times and the remove
  // button hides at 1, so these guards are unreachable in normal use.
  const handleAddTime = () => {
    if (times.length >= 3) return;

    // Add a new time (default to 2 hours after the last time)
    const lastTime = times[times.length - 1];
    const newTime = new Date(lastTime);
    newTime.setHours(lastTime.getHours() + 2);
    setTimes([...times, newTime]);
  };

  const handleRemoveTime = (index: number) => {
    if (times.length === 1) return;

    const newTimes = times.filter((_, i) => i !== index);
    setTimes(newTimes);
  };

  const handleSave = async () => {
    // If no changes, just close the modal without rescheduling
    if (!hasTimesChanged()) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      // Save the times to AsyncStorage (always save user preference, even if push registration fails)
      const timeStrings = times.map((t) => t.toISOString());
      await onboardingService.setNotificationTimes(timeStrings);

      // Push the updated times to the backend (server-driven scheduling).
      // Settings is an explicit opt-in, so prompt for permission if the user
      // hasn't decided yet (passive callers never prompt — see registerForPush).
      const registered = await notificationService.registerForPush(locale, {
        promptIfUndetermined: true,
      });
      if (!registered) {
        // The times are saved locally, but no daily push will arrive until the
        // device is registered. Showing the green "updated" toast here would
        // falsely confirm delivery, so surface the real state instead — pointing
        // to Settings when notifications are disabled (the usual cause), or a
        // generic retry otherwise. The modal stays open so the user can act.
        Alert.alert(
          hasNotificationPermission ? t('error') : t('enableNotifications'),
          hasNotificationPermission
            ? t('failedToUpdateNotificationTimes')
            : t('notificationPermissionWarning')
        );
        return;
      }

      // Update parent component with the first time (for backward compatibility)
      if (onTimeChange) {
        onTimeChange(times[0]);
      }

      // Track notification time change and update user property
      trackNotificationTimeChange(times.length);
      updateNotificationProperty(times);

      // Show success toast
      setTimeout(() => {
        setShowSuccessToast(true);
      }, 100);
    } catch (error) {
      console.error('Error updating notification times:', error);
      Alert.alert(t('error'), t('failedToUpdateNotificationTimes'));
    } finally {
      setIsSaving(false);
    }
  };

  const renderTimePicker = (time: Date, index: number, label?: string) => {
    const isActive = activePickerIndex === index;

    return (
      <View key={index} style={dynamicStyles.timePickerItem}>
        <View style={dynamicStyles.timePickerHeader}>
          {label && <Text.Label color={colors.text}>{label}</Text.Label>}
          {times.length > 1 && (
            <Pressable
              onPress={() => handleRemoveTime(index)}
              style={[dynamicStyles.removeButton, { backgroundColor: colors.surface }]}
            >
              <Trash2 size={iconSizes.sm} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <View
          style={[
            dynamicStyles.timePickerContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              // Use smaller height when compact mode is used (multiple times)
              minHeight: Platform.OS === 'ios' ? (times.length > 1 ? 60 : 200) : 60,
            },
          ]}
        >
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={time}
              mode="time"
              is24Hour={true}
              // Use compact display when there are multiple pickers to allow scrolling
              // Spinner mode blocks scroll gestures
              display={times.length > 1 ? 'compact' : 'spinner'}
              onChange={(event, date) => handleTimeChange(index, event, date)}
              textColor={theme === 'dark' ? '#FFFFFF' : '#1A1D2E'}
              themeVariant={theme}
            />
          ) : (
            <>
              <Pressable
                onPress={() => setActivePickerIndex(index)}
                style={[dynamicStyles.androidTimeButton, { backgroundColor: colors.primary }]}
              >
                <Text.Label color="#FFFFFF">
                  {time.toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </Text.Label>
              </Pressable>
              {isActive && (
                <DateTimePicker
                  value={time}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  onChange={(event, date) => handleTimeChange(index, event, date)}
                />
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  const getTimeLabels = () => {
    // Always show labels as "Time 1", "Time 2", "Time 3" for clarity
    return times.map((_, index) => `${t('time')} ${index + 1}`);
  };

  const handleSuccessToastHide = () => {
    setShowSuccessToast(false);
    onClose();
  };

  const dynamicStyles = useMemo(
    () => ({
      content: {
        padding: spacing.lg,
        gap: spacing.md,
      },
      warningContainer: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        gap: spacing.sm,
        marginBottom: spacing.sm,
      },
      timePickerItem: {
        marginBottom: spacing.sm,
      },
      timePickerHeader: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        marginBottom: spacing.xs,
      },
      removeButton: {
        padding: spacing.xs,
        borderRadius: radius.sm,
      },
      timePickerContainer: {
        padding: Platform.OS === 'ios' ? spacing.lg : spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
      addButton: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: 'dashed' as const,
        gap: spacing.xs,
        marginTop: spacing.sm,
      },
      androidTimeButton: {
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: radius.full,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        minWidth: 150,
      },
    }),
    [spacing, radius]
  );

  return (
    <>
      <DialogShell
        // The toast renders as a passthrough inline overlay in the main
        // window, so on Android it can never paint above the dialog's native
        // Modal window — slide the dialog out while the toast shows instead.
        // Toast onHide still drives the real close (parent flips `visible`).
        visible={visible && !showSuccessToast}
        onClose={onClose}
        title={t('settingsNotificationTime')}
        showClose
        maxWidth={maxModalWidth}
        footer={
          <DialogButton
            label={isSaving ? t('saving') : t('save')}
            onPress={handleSave}
            disabled={isSaving}
          />
        }
      >
        <ScrollView
          style={{ maxHeight: screenHeight * 0.55 }}
          showsVerticalScrollIndicator={true}
          overScrollMode="never"
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
        >
          <View style={dynamicStyles.content}>
            {!hasNotificationPermission && (
              <Pressable
                style={({ pressed }) => [
                  dynamicStyles.warningContainer,
                  {
                    backgroundColor: `${warningColor}20`,
                    borderColor: warningColor,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                onPress={async () => {
                  try {
                    if (Platform.OS === 'ios') {
                      await Linking.openURL('app-settings:');
                    } else {
                      await Linking.openSettings();
                    }
                  } catch (error) {
                    console.error('Error opening notification settings:', error);
                  }
                }}
              >
                <AlertTriangle size={iconSizes.md} color={warningColor} />
                <Text.Caption color={warningColor} style={{ flex: 1 }}>
                  {t('notificationPermissionWarning')}
                </Text.Caption>
              </Pressable>
            )}

            <Text.Label
              textAlign="center"
              color={colors.textSecondary}
              style={{ marginBottom: spacing.sm }}
            >
              {t('scheduleUpTo3Notifications')}
            </Text.Label>

            {times.map((time, index) => renderTimePicker(time, index, getTimeLabels()[index]))}

            {times.length < 3 && (
              <Pressable
                onPress={handleAddTime}
                style={[
                  dynamicStyles.addButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Plus size={iconSizes.md} color={colors.primary} />
                <Text.Label color={colors.primary}>{t('addAnotherTime')}</Text.Label>
              </Pressable>
            )}

            <Text.Caption
              textAlign="center"
              color={colors.textSecondary}
              fontFamily={FONT_FAMILIES.semibold}
              style={{ marginTop: spacing.sm }}
            >
              {t('multipleNotificationsPerDay', { count: times.length })}
            </Text.Caption>
            <Text.Caption
              textAlign="center"
              color={colors.textSecondary}
              fontStyle="italic"
              style={{ marginTop: spacing.xs }}
            >
              {t('notificationRespectMessage')}
            </Text.Caption>
          </View>
        </ScrollView>
      </DialogShell>

      <SuccessToast
        visible={showSuccessToast}
        message={times.length === 1 ? t('notificationTimeUpdated') : t('notificationTimesUpdated')}
        onHide={handleSuccessToastHide}
      />
    </>
  );
};
