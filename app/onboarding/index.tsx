import React, { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { styled } from '@tamagui/core';
import { YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { tokens } from '../../src/theme/tokens';
import { H1, BodyText, Button } from '../../src/components';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import * as onboardingService from '../../src/services/onboarding';

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: '$background',
  justifyContent: 'center',
  alignItems: 'center',
  padding: tokens.space.xl,
});

const ContentContainer = styled(YStack, {
  gap: tokens.space.xl,
  alignItems: 'center',
  maxWidth: 400,
});

export default function OnboardingInitialization() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await onboardingService.initializeOnboarding(locale);

      if (result.success) {
        // Navigate to category selection
        router.replace('/onboarding/categories');
      } else {
        setError(result.error || 'Failed to initialize. Please try again.');
      }
    } catch (err) {
      console.error('Initialization error:', err);
      setError('An unexpected error occurred. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    initialize();
  };

  if (isLoading) {
    return (
      <Container>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <ContentContainer>
          <ActivityIndicator size="large" color={tokens.color.light.primary} />
          <H1 textAlign="center">{t('settingUpApp')}</H1>
          <BodyText textAlign="center" color="$textSecondary">
            {t('onlyTakeMoment')}
          </BodyText>
        </ContentContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <ContentContainer>
          <YStack gap="$md" alignItems="center">
            <H1 textAlign="center">{t('oops')}</H1>
            <BodyText textAlign="center" color="$textSecondary">
              {error}
            </BodyText>
          </YStack>
          <Button onPress={handleRetry}>{t('tryAgain')}</Button>
        </ContentContainer>
      </Container>
    );
  }

  return null;
}
