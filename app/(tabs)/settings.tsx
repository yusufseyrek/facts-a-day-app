import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Alert } from 'react-native';
import { styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { tokens } from '../../src/theme/tokens';
import { H1, H2, Button } from '../../src/components';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import * as onboardingService from '../../src/services/onboarding';
import * as database from '../../src/services/database';

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: '$background',
});

const ContentContainer = styled(YStack, {
  padding: tokens.space.xl,
  gap: tokens.space.lg,
  flex: 1,
});

const SectionContainer = styled(YStack, {
  gap: tokens.space.md,
  marginBottom: tokens.space.xl,
});

const SectionTitle = styled(H2, {
  marginBottom: tokens.space.sm,
});

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();

  const handleResetOnboarding = async () => {
    try {
      await onboardingService.resetOnboarding();
      router.replace('/onboarding');
    } catch (error) {
      console.error('Error resetting onboarding:', error);
    }
  };

  const handleTestNotification = async () => {
    try {
      console.log('🔔 Starting test notification...');

      const { status } = await Notifications.getPermissionsAsync();
      console.log('📱 Permission status:', status);

      if (status !== 'granted') {
        Alert.alert(
          t('notificationPermissionRequired'),
          t('notificationPermissionMessage'),
          [{ text: t('ok'), style: 'default' }]
        );
        return;
      }

      const facts = await database.getRandomUnscheduledFacts(1, locale);
      console.log('📚 Facts found:', facts.length);

      if (facts.length === 0) {
        Alert.alert(
          t('noFactAvailable'),
          'There are no facts available to test notifications.',
          [{ text: t('ok'), style: 'default' }]
        );
        return;
      }

      const fact = facts[0];
      console.log(
        '✅ Using fact:',
        fact.id,
        '-',
        fact.content.substring(0, 50) + '...'
      );

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: fact.title || t('todaysFact'),
          body: fact.summary || fact.content.substring(0, 100),
          data: { factId: fact.id, isTest: true },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
          repeats: false,
        },
      });

      console.log('✅ Notification scheduled with ID:', notificationId);

      Alert.alert(
        'Test Notification Scheduled',
        'You should receive a test notification in 2 seconds!',
        [{ text: t('ok'), style: 'default' }]
      );
    } catch (error) {
      console.error('❌ Error scheduling test notification:', error);
      Alert.alert(
        'Error',
        `Failed to schedule test notification: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        [{ text: t('ok'), style: 'default' }]
      );
    }
  };

  const handleAdd10RandomFacts = async () => {
    try {
      console.log('📚 Starting to send 10 random fact notifications...');

      // Check notification permissions
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('notificationPermissionRequired'),
          t('notificationPermissionMessage'),
          [{ text: t('ok'), style: 'default' }]
        );
        return;
      }

      // Get 10 random facts
      const facts = await database.getAllFacts(locale);
      console.log('📚 Total facts found:', facts.length);

      if (facts.length === 0) {
        Alert.alert(
          t('noFactAvailable'),
          'There are no facts available.',
          [{ text: t('ok'), style: 'default' }]
        );
        return;
      }

      // Select up to 10 random facts
      const shuffled = facts.sort(() => 0.5 - Math.random());
      const selectedFacts = shuffled.slice(0, Math.min(10, facts.length));

      console.log(`📚 Scheduling ${selectedFacts.length} notifications...`);

      const now = new Date();

      // Schedule all 10 notifications immediately (staggered by 2 seconds each)
      // AND mark them as scheduled in the database so they appear in the home feed
      for (let i = 0; i < selectedFacts.length; i++) {
        const fact = selectedFacts[i];

        // Schedule notification
        await Notifications.scheduleNotificationAsync({
          content: {
            title: fact.title || t('didYouKnow'),
            body: fact.summary || fact.content.substring(0, 100),
            data: { factId: fact.id },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 2 + (i * 2), // Stagger by 2 seconds each
            repeats: false,
          },
        });

        // Mark fact as scheduled with today's date so it appears in home feed
        const scheduledDate = new Date(now);
        scheduledDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds() + (2 + i * 2), 0);
        const notificationId = `manual_${fact.id}_${Date.now()}_${i}`;

        await database.markFactAsScheduled(
          fact.id,
          scheduledDate.toISOString(),
          notificationId
        );

        console.log(`✅ Scheduled notification ${i + 1} for fact ${fact.id}`);
      }

      // Show success message
      const message = t('factsAddedDescription').replace('{count}', selectedFacts.length.toString());
      Alert.alert(
        t('factsAdded'),
        message,
        [{ text: t('ok'), style: 'default' }]
      );
    } catch (error) {
      console.error('❌ Error sending notifications:', error);
      Alert.alert(
        t('errorAddingFacts'),
        error instanceof Error ? error.message : 'Unknown error',
        [{ text: t('ok'), style: 'default' }]
      );
    }
  };

  return (
    <Container>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <ContentContainer>
        {/* Header */}
        <H1>{t('settings')}</H1>

        {/* Developer Settings Section */}
        <SectionContainer>
          <SectionTitle>{t('developerSettings')}</SectionTitle>

          <Button onPress={handleAdd10RandomFacts}>
            {t('add10RandomFacts')}
          </Button>

          <Button onPress={handleTestNotification}>
            {t('testNotification')}
          </Button>

          <Button variant="secondary" onPress={toggleTheme}>
            {`${t('toggleTheme')} (${theme})`}
          </Button>

          <Button variant="secondary" onPress={handleResetOnboarding}>
            {t('resetOnboarding')}
          </Button>
        </SectionContainer>
      </ContentContainer>
    </Container>
  );
}
