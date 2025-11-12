import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { X, Crown, Plus, Trash2 } from '@tamagui/lucide-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme';
import { tokens } from '../../theme/tokens';
import { useTranslation } from '../../i18n/useTranslation';
import { Button } from '../Button';
import * as onboardingService from '../../services/onboarding';
import * as notificationService from '../../services/notifications';
import { useIsPremium } from '../../contexts/SubscriptionContext';
import { useRouter } from 'expo-router';

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  currentTime: Date;
  onTimeChange: (time: Date) => void;
}

export const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible,
  onClose,
  currentTime,
  onTimeChange,
}) => {
  const { theme } = useTheme();
  const colors = tokens.color[theme];
  const { t, locale } = useTranslation();
  const isPremium = useIsPremium();
  const router = useRouter();

  // For premium: multiple times, for free: single time
  const [times, setTimes] = useState<Date[]>([currentTime]);
  const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      } else {
        // Default to single time
        setTimes([currentTime]);
      }
    } catch (error) {
      console.error('Error loading saved times:', error);
      setTimes([currentTime]);
    }
  };

  const handleTimeChange = (event: any, date?: Date) => {
    // Capture the current active index before resetting (fixes race condition)
    const currentActiveIndex = activePickerIndex;

    // On Android, hide the picker when user confirms or cancels
    if (Platform.OS === 'android') {
      setActivePickerIndex(null);
    }

    // Only update time if user confirmed (not cancelled) and we have an active picker
    if (event.type === 'set' && date && currentActiveIndex !== null) {
      const newTimes = [...times];
      newTimes[currentActiveIndex] = date;
      setTimes(newTimes);
    }
  };

  const handleAddTime = () => {
    if (!isPremium) {
      // Show upgrade prompt
      Alert.alert(
        'Premium Feature',
        'Multiple daily facts is a premium feature. Upgrade to get up to 3 facts per day!',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Upgrade',
            onPress: () => {
              onClose();
              router.push('/paywall');
            },
          },
        ]
      );
      return;
    }

    if (times.length >= 3) {
      Alert.alert('Maximum Reached', 'You can schedule up to 3 notifications per day.');
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
      Alert.alert('Minimum Required', 'You must have at least one notification time.');
      return;
    }

    const newTimes = times.filter((_, i) => i !== index);
    setTimes(newTimes);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save the times to AsyncStorage
      const timeStrings = times.map(t => t.toISOString());
      await onboardingService.setNotificationTimes(timeStrings);

      // Reschedule notifications with the new times
      // Use the appropriate function based on number of times
      if (times.length > 1) {
        // Premium users with multiple times
        await notificationService.rescheduleNotificationsMultiple(times, locale);
      } else {
        // Free users with single time
        await notificationService.rescheduleNotifications(times[0], locale);
      }

      // Update parent component with the first time (for backward compatibility)
      onTimeChange(times[0]);

      // Close modal
      onClose();
    } catch (error) {
      console.error('Error updating notification times:', error);
      Alert.alert('Error', 'Failed to update notification times. Please try again.');
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
            <Text style={[styles.timeLabel, { color: colors.text }]}>
              {label}
            </Text>
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
              is24Hour={false}
              display="spinner"
              onChange={(event, date) => {
                setActivePickerIndex(index);
                handleTimeChange(event, date);
              }}
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
                <Text style={styles.androidTimeButtonText}>
                  {time.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </Text>
              </Pressable>
              {isActive && (
                <DateTimePicker
                  value={time}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={handleTimeChange}
                />
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  const getTimeLabels = () => {
    if (times.length === 1) return [undefined];
    if (times.length === 2) return ['Morning', 'Evening'];
    return ['Morning', 'Afternoon', 'Evening'];
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
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
            <Text style={[styles.title, { color: colors.text }]}>
              {t('settingsNotificationTime')}
            </Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent}>
            <View style={styles.content}>
              <Text
                style={[
                  styles.description,
                  { color: colors.textSecondary },
                ]}
              >
                {isPremium
                  ? 'Schedule up to 3 notifications per day'
                  : t('selectNotificationTime')}
              </Text>

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
                  <Text style={[styles.addButtonText, { color: colors.primary }]}>
                    Add Another Time {!isPremium && '(Premium)'}
                  </Text>
                  {!isPremium && <Crown size={16} color={colors.primary} />}
                </Pressable>
              )}

              <Text
                style={[
                  styles.helperText,
                  { color: colors.textSecondary },
                ]}
              >
                {times.length === 1
                  ? t('oneNotificationPerDay')
                  : `${times.length} notifications per day`}
              </Text>
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
  title: {
    fontSize: tokens.fontSize.h2,
    fontWeight: tokens.fontWeight.bold,
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
  description: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.medium,
    textAlign: 'center',
    marginBottom: tokens.space.sm,
  },
  timePickerItem: {
    marginBottom: tokens.space.md,
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space.xs,
  },
  timeLabel: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.semibold,
  },
  removeButton: {
    padding: tokens.space.xs,
    borderRadius: tokens.radius.sm,
  },
  timePickerContainer: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250, // Ensure enough space for iOS picker
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
  addButtonText: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.medium,
  },
  helperText: {
    fontSize: tokens.fontSize.small,
    textAlign: 'center',
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
  androidTimeButtonText: {
    color: '#FFFFFF',
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.semibold,
  },
});
