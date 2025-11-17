import React, { useState } from 'react';
import { Platform, Alert } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Plus, Trash2 } from '@tamagui/lucide-icons';
import { tokens } from '../theme/tokens';
import { BodyText, Button } from './';
import { useTheme } from '../theme';
import { useTranslation } from '../i18n';

const TimeSlotContainer = styled(YStack, {
  gap: tokens.space.lg,
});

const TimeSlot = styled(XStack, {
  backgroundColor: '$surface',
  padding: tokens.space.md,
  borderRadius: tokens.radius.lg,
  borderWidth: 1,
  borderColor: '$border',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: tokens.space.md,
  minHeight: 56,
});

const TimeDisplay = styled(XStack, {
  flex: 1,
  gap: tokens.space.md,
  alignItems: 'center',
});

const IOSPickerWrapper = styled(YStack, {
  flex: 1,
  alignItems: 'flex-start',
});

const TimeButtonWrapper = styled(YStack, {
  flex: 1,
});

const DeleteButton = styled(XStack, {
  width: 36,
  height: 36,
  borderRadius: tokens.radius.sm,
  backgroundColor: '$errorLight',
  alignItems: 'center',
  justifyContent: 'center',
  pressStyle: {
    opacity: 0.7,
    scale: 0.95,
  },
});

const AddTimeButton = styled(XStack, {
  backgroundColor: 'transparent',
  padding: tokens.space.lg,
  borderRadius: tokens.radius.lg,
  borderWidth: 2,
  borderColor: '$primary',
  borderStyle: 'dashed',
  alignItems: 'center',
  justifyContent: 'center',
  gap: tokens.space.sm,
  minHeight: 60,
  pressStyle: {
    opacity: 0.7,
    scale: 0.98,
  },
});

interface MultiTimePickerProps {
  times: Date[];
  onTimesChange: (times: Date[]) => void;
  maxTimes?: number;
  minTimes?: number;
}

export function MultiTimePicker({
  times,
  onTimesChange,
  maxTimes = 5,
  minTimes = 1,
}: MultiTimePickerProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [androidPickerTime, setAndroidPickerTime] = useState<Date>(new Date());

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleAddTime = () => {
    if (times.length >= maxTimes) {
      Alert.alert(
        t('maxTimesReached'),
        t('maxTimesReachedMessage').replace('{max}', maxTimes.toString()),
        [{ text: t('ok'), style: 'default' }]
      );
      return;
    }

    // Create a new time 1 hour after the last time
    const lastTime = times[times.length - 1];
    const newTime = new Date(lastTime);
    newTime.setHours(newTime.getHours() + 1);

    onTimesChange([...times, newTime]);
  };

  const handleRemoveTime = (index: number) => {
    if (times.length <= minTimes) {
      Alert.alert(
        t('minTimesRequired'),
        t('minTimesRequiredMessage').replace('{min}', minTimes.toString()),
        [{ text: t('ok'), style: 'default' }]
      );
      return;
    }

    const newTimes = times.filter((_, i) => i !== index);
    onTimesChange(newTimes);
  };

  const handleTimeChange = (index: number, event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowAndroidPicker(false);
      setEditingIndex(null);
    }

    if (event.type === 'set' && selectedDate) {
      const newTimes = [...times];
      newTimes[index] = selectedDate;
      onTimesChange(newTimes);
    }
  };

  const handleAndroidTimePress = (index: number) => {
    setEditingIndex(index);
    setAndroidPickerTime(times[index]);
    setShowAndroidPicker(true);
  };

  return (
    <TimeSlotContainer>
      <BodyText
        fontWeight={tokens.fontWeight.bold}
        textAlign="center"
        fontSize={tokens.fontSize.body}
        marginBottom="$xs"
      >
        {t('notificationTimes')}
      </BodyText>

      {times.map((time, index) => (
        <TimeSlot key={index}>
          <BodyText
            fontSize={tokens.fontSize.small}
            color="$textSecondary"
            fontWeight={tokens.fontWeight.medium}
            minWidth={60}
          >
            {t('time')} {index + 1}
          </BodyText>

          <TimeDisplay>
            {Platform.OS === 'ios' ? (
              <IOSPickerWrapper>
                <DateTimePicker
                  value={time}
                  mode="time"
                  display="compact"
                  onChange={(event, selectedDate) =>
                    handleTimeChange(index, event, selectedDate)
                  }
                  themeVariant={theme}
                />
              </IOSPickerWrapper>
            ) : (
              <TimeButtonWrapper>
                <Button
                  onPress={() => handleAndroidTimePress(index)}
                  variant="secondary"
                >
                  {formatTime(time)}
                </Button>
              </TimeButtonWrapper>
            )}
          </TimeDisplay>

          {times.length > minTimes && (
            <DeleteButton onPress={() => handleRemoveTime(index)}>
              <Trash2 size={20} color={tokens.color.light.error} />
            </DeleteButton>
          )}
        </TimeSlot>
      ))}

      {Platform.OS === 'android' && showAndroidPicker && editingIndex !== null && (
        <DateTimePicker
          value={androidPickerTime}
          mode="time"
          is24Hour={false}
          display="default"
          onChange={(event, selectedDate) =>
            handleTimeChange(editingIndex, event, selectedDate)
          }
        />
      )}

      {times.length < maxTimes && (
        <AddTimeButton onPress={handleAddTime}>
          <Plus size={24} color={tokens.color.light.primary} />
          <BodyText
            color="$primary"
            fontWeight={tokens.fontWeight.bold}
            fontSize={tokens.fontSize.body}
          >
            {t('addAnotherTime')}
          </BodyText>
        </AddTimeButton>
      )}

      <BodyText
        fontSize={tokens.fontSize.small}
        color="$textSecondary"
        textAlign="center"
        lineHeight={20}
        marginTop="$md"
        fontWeight={tokens.fontWeight.medium}
      >
        {t('multipleNotificationsPerDay').replace('{count}', times.length.toString())}
      </BodyText>
    </TimeSlotContainer>
  );
}
