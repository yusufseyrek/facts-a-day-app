import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { X } from '@tamagui/lucide-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme';
import { tokens } from '../../theme/tokens';
import { useTranslation } from '../../i18n/useTranslation';
import { Button } from '../Button';
import * as onboardingService from '../../services/onboarding';
import * as notificationService from '../../services/notifications';

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
  const [selectedTime, setSelectedTime] = useState(currentTime);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleTimeChange = (event: any, date?: Date) => {
    // On Android, hide the picker when user confirms or cancels
    if (Platform.OS === 'android') {
      setShowAndroidPicker(false);
    }

    // Only update time if user confirmed (not cancelled)
    if (event.type === 'set' && date) {
      setSelectedTime(date);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save the time to AsyncStorage
      await onboardingService.setNotificationTime(selectedTime);

      // Reschedule notifications with the new time
      await notificationService.rescheduleNotifications(selectedTime, locale);

      // Update parent component
      onTimeChange(selectedTime);

      // Close modal
      onClose();
    } catch (error) {
      console.error('Error updating notification time:', error);
    } finally {
      setIsSaving(false);
    }
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

          <View style={styles.content}>
            <Text
              style={[
                styles.description,
                { color: colors.textSecondary },
              ]}
            >
              {t('selectNotificationTime')}
            </Text>

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
                <View style={styles.iosPickerWrapper}>
                  <DateTimePicker
                    value={selectedTime}
                    mode="time"
                    is24Hour={false}
                    display="spinner"
                    onChange={handleTimeChange}
                    style={{ width: '100%' }}
                    textColor={theme === 'dark' ? '#FFFFFF' : '#1A1D2E'}
                    themeVariant={theme}
                  />
                </View>
              ) : (
                <>
                  <Button onPress={() => setShowAndroidPicker(true)}>
                    {selectedTime.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </Button>
                  {showAndroidPicker && (
                    <DateTimePicker
                      value={selectedTime}
                      mode="time"
                      is24Hour={false}
                      display="default"
                      onChange={handleTimeChange}
                    />
                  )}
                </>
              )}
            </View>

            <Text
              style={[
                styles.helperText,
                { color: colors.textSecondary },
              ]}
            >
              {t('oneNotificationPerDay')}
            </Text>
          </View>

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
  content: {
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  description: {
    fontSize: tokens.fontSize.body,
    fontWeight: tokens.fontWeight.medium,
    textAlign: 'center',
  },
  timePickerContainer: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosPickerWrapper: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    width: '100%',
    alignItems: 'center',
  },
  helperText: {
    fontSize: tokens.fontSize.small,
    textAlign: 'center',
  },
  footer: {
    padding: tokens.space.lg,
    paddingTop: 0,
  },
});
