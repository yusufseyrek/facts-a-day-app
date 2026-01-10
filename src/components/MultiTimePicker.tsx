import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';

import DateTimePicker from '@react-native-community/datetimepicker';
import { Plus, Trash2 } from '@tamagui/lucide-icons';
import { XStack, YStack } from 'tamagui';

import { useTranslation } from '../i18n';
import { hexColors, useTheme } from '../theme';
import { useResponsive } from '../utils/useResponsive';

import { FONT_FAMILIES, Text } from './Typography';

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
  const { spacing, radius, iconSizes } = useResponsive();
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
      Alert.alert(t('maxTimesReached'), t('maxTimesReachedMessage', { max: maxTimes }), [
        { text: t('ok'), style: 'default' },
      ]);
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
      Alert.alert(t('minTimesRequired'), t('minTimesRequiredMessage', { min: minTimes }), [
        { text: t('ok'), style: 'default' },
      ]);
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
    <YStack gap={spacing.lg}>
      <Text.Body
        fontFamily={FONT_FAMILIES.bold}
        textAlign="center"
        style={{ marginBottom: spacing.xs }}
      >
        {t('notificationTimes')}
      </Text.Body>

      {times.map((time, index) => (
        <XStack
          key={index}
          backgroundColor="$surface"
          paddingVertical={spacing.md}
          paddingHorizontal={spacing.lg}
          borderRadius={radius.lg}
          borderWidth={1}
          borderColor="$border"
          alignItems="center"
          justifyContent="center"
          alignSelf="center"
          gap={spacing.md}
        >
          <Text.Label color="$textSecondary" fontFamily={FONT_FAMILIES.medium}>
            {t('time')} {index + 1}
          </Text.Label>

          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={time}
              mode="time"
              display="compact"
              onChange={(event, selectedDate) => handleTimeChange(index, event, selectedDate)}
              themeVariant={theme}
            />
          ) : (
            <XStack
              backgroundColor="$primaryLight"
              paddingVertical={spacing.sm}
              paddingHorizontal={spacing.lg}
              borderRadius={radius.full}
              pressStyle={{ opacity: 0.7, scale: 0.98 }}
              onPress={() => handleAndroidTimePress(index)}
            >
              <Text.Label fontFamily={FONT_FAMILIES.bold} color="$primary">
                {formatTime(time)}
              </Text.Label>
            </XStack>
          )}

          {times.length > minTimes && (
            <XStack
              width={36}
              height={36}
              borderRadius={radius.sm}
              backgroundColor="$errorLight"
              alignItems="center"
              justifyContent="center"
              pressStyle={{ opacity: 0.7, scale: 0.95 }}
              onPress={() => handleRemoveTime(index)}
            >
              <Trash2 size={iconSizes.md} color={hexColors.light.error} />
            </XStack>
          )}
        </XStack>
      ))}

      {Platform.OS === 'android' && showAndroidPicker && editingIndex !== null && (
        <DateTimePicker
          value={androidPickerTime}
          mode="time"
          is24Hour={false}
          display="default"
          onChange={(event, selectedDate) => handleTimeChange(editingIndex, event, selectedDate)}
        />
      )}

      {times.length < maxTimes && (
        <XStack
          backgroundColor="transparent"
          padding={spacing.lg}
          borderRadius={radius.lg}
          borderWidth={2}
          borderColor="$primary"
          borderStyle="dashed"
          alignItems="center"
          justifyContent="center"
          gap={spacing.sm}
          minHeight={60}
          pressStyle={{ opacity: 0.7, scale: 0.98 }}
          onPress={handleAddTime}
        >
          <Plus size={iconSizes.lg} color={hexColors.light.primary} />
          <Text.Body color="$primary" fontFamily={FONT_FAMILIES.bold}>
            {t('addAnotherTime')}
          </Text.Body>
        </XStack>
      )}

      <YStack gap={spacing.xs} marginTop={spacing.md}>
        <Text.Caption
          color="$textSecondary"
          textAlign="center"
          lineHeight={20}
          fontFamily={FONT_FAMILIES.semibold}
        >
          {t('multipleNotificationsPerDay', { count: times.length })}
        </Text.Caption>
        <Text.Caption color="$textSecondary" textAlign="center" lineHeight={18} fontStyle="italic">
          {t('notificationRespectMessage')}
        </Text.Caption>
      </YStack>
    </YStack>
  );
}
