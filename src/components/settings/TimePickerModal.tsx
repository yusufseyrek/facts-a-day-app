import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { X, Plus, Trash2, AlertTriangle } from '@tamagui/lucide-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme';
import { tokens } from '../../theme/tokens';
import { useTranslation } from '../../i18n/useTranslation';
import { Button } from '../Button';
import { SuccessToast } from '../SuccessToast';
import * as onboardingService from '../../services/onboarding';
import * as notificationService from '../../services/notifications';
import { showSettingsInterstitial } from '../../services/adManager';
import { H2, LabelText, BodyText, SmallText } from '../Typography';
import { trackNotificationTimeChange, updateNotificationProperty } from '../../services/analytics';

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
  const colors = tokens.color[theme];
  const { t, locale } = useTranslation();
  
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
        const parsedTimes = savedTimes.map(t => new Date(t));
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

  const handleAddTime = () => {
    if (times.length >= 3) {
      Alert.alert(t('maximumReached'), t('youCanScheduleUpTo3'));
      return;
    }

    // Add a new time (default to 2 hours after the last time)
    const lastTime = times[times.length - 1];
    const newTime = new Date(lastTime);
    newTime.setHours(lastTime.getHours() + 2);
    setTimes([...times, newTime]);
  };

  const handleRemoveTime = (index: number) => {
    if (times.length === 1) {
      Alert.alert(t('minimumRequired'), t('youMustHaveAtLeastOne'));
      return;
    }

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
      // Save the times to AsyncStorage (always save user preference, even if notifications fail)
      const timeStrings = times.map(t => t.toISOString());
      await onboardingService.setNotificationTimes(timeStrings);

      // Reschedule notifications with the new times
      // Use the appropriate function based on number of times
      let result;
      if (times.length > 1) {
        // Premium users with multiple times
        result = await notificationService.rescheduleNotificationsMultiple(times, locale);
      } else {
        // Free users with single time
        result = await notificationService.rescheduleNotifications(times[0], locale);
      }

      // Update parent component with the first time (for backward compatibility)
      if (onTimeChange) {
        onTimeChange(times[0]);
      }

      // Check if scheduling failed due to permission issues
      if (!result.success && result.error?.includes('permission')) {
        console.log('Notification scheduling failed due to permission, but times were saved');
        // Still show success - times were saved, just notifications couldn't be scheduled
      } else if (result.success) {
        console.log(`Successfully rescheduled ${result.count} notifications`);
      }

      // Track notification time change and update user property
      trackNotificationTimeChange(times.length);
      updateNotificationProperty(times);

      // Show interstitial ad after successful notification time update
      await showSettingsInterstitial();

      // Show success toast after ad closes (small delay to ensure proper render after ad)
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
      <View key={index} style={styles.timePickerItem}>
        <View style={styles.timePickerHeader}>
          {label && (
            <LabelText color={colors.text}>
              {label}
            </LabelText>
          )}
          {times.length > 1 && (
            <Pressable
              onPress={() => handleRemoveTime(index)}
              style={[
                styles.removeButton,
                { backgroundColor: colors.surface },
              ]}
            >
              <Trash2 size={16} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <View
          style={[
            styles.timePickerContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={time}
              mode="time"
              is24Hour={true}
              display="spinner"
              onChange={(event, date) => handleTimeChange(index, event, date)}
              textColor={theme === 'dark' ? '#FFFFFF' : '#1A1D2E'}
              themeVariant={theme}
            />
          ) : (
            <>
              <Pressable
                onPress={() => setActivePickerIndex(index)}
                style={[
                  styles.androidTimeButton,
                  { backgroundColor: colors.primary }
                ]}
              >
                <LabelText color="#FFFFFF">
                  {time.toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </LabelText>
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SuccessToast
          visible={showSuccessToast}
          message={t('notificationTimesUpdated')}
          onHide={handleSuccessToastHide}
        />
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.background },
          ]}
        >
          <View
            style={[
              styles.header,
              { borderBottomColor: colors.border },
            ]}
          >
            <H2 color={colors.text}>
              {t('settingsNotificationTime')}
            </H2>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent}>
            <View style={styles.content}>
              {!hasNotificationPermission && (
                <Pressable
                  style={({ pressed }) => [
                    styles.warningContainer,
                    { 
                      backgroundColor: `${warningColor}20`, 
                      borderColor: warningColor,
                      opacity: pressed ? 0.7 : 1,
                    }
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
                  <AlertTriangle size={18} color={warningColor} />
                  <SmallText color={warningColor} style={{ flex: 1 }}>
                    {t('notificationPermissionWarning')}
                  </SmallText>
                </Pressable>
              )}

              <LabelText
                textAlign="center"
                color={colors.textSecondary}
                style={{ marginBottom: tokens.space.sm }}
              >
                {t('scheduleUpTo3Notifications')}
              </LabelText>

              {times.map((time, index) =>
                renderTimePicker(time, index, getTimeLabels()[index])
              )}

              {times.length < 3 && (
                <Pressable
                  onPress={handleAddTime}
                  style={[
                    styles.addButton,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Plus size={20} color={colors.primary} />
                  <LabelText color={colors.primary}>
                    {t('addAnotherTime')}
                  </LabelText>
                </Pressable>
              )}

              <SmallText
                textAlign="center"
                color={colors.textSecondary}
                fontFamily="Montserrat_600SemiBold"
                style={{ marginTop: tokens.space.sm }}
              >
                {t('multipleNotificationsPerDay', { count: times.length })}
              </SmallText>
              <SmallText
                textAlign="center"
                color={colors.textSecondary}
                fontStyle="italic"
                style={{ marginTop: tokens.space.xs }}
              >
                {t('notificationRespectMessage')}
              </SmallText>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
            >
              {t('save')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    maxHeight: '80%',
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.lg,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: tokens.space.xs,
  },
  scrollContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  content: {
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: tokens.space.sm,
    marginBottom: tokens.space.sm,
  },
  timePickerItem: {
    marginBottom: tokens.space.sm,
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space.xs,
  },
  removeButton: {
    padding: tokens.space.xs,
    borderRadius: tokens.radius.sm,
  },
  timePickerContainer: {
    padding: Platform.OS === 'ios' ? tokens.space.lg : tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'ios' ? 200 : 60, // iOS needs space for spinner, Android only shows button
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: tokens.space.xs,
    marginTop: tokens.space.sm,
  },
  footer: {
    padding: tokens.space.lg,
    paddingTop: 0,
  },
  androidTimeButton: {
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 150,
  },
});
