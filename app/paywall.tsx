import React, { useState } from 'react';
import { ScrollView, Alert, Platform, Pressable } from 'react-native';
import { YStack, XStack, Text, Button, Separator } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Crown, Zap, Bell, Star, Check } from '@tamagui/lucide-icons';
import { StatusBar } from 'expo-status-bar';
import { styled } from '@tamagui/core';
import { useTheme } from '../src/theme';
import { tokens } from '../src/theme/tokens';
import { useSubscription } from '../src/contexts/SubscriptionContext';
import { markPaywallShown } from '../src/services/paywallManager';
import { useTranslation } from '../src/i18n';

// Color palette
const colors = {
  yellow: {
    light: '#FEF3C7',
    main: '#FFD700',
    dark: '#F59E0B',
  },
  blue: {
    light: '#DBEAFE',
    main: '#3B82F6',
    dark: '#1E40AF',
    accent: '#2563EB',
  },
  green: {
    light: '#D1FAE5',
    main: '#10B981',
    dark: '#059669',
  },
  purple: {
    light: '#E9D5FF',
    main: '#A855F7',
    dark: '#7C3AED',
  },
  gray: {
    light: '#F3F4F6',
    main: '#6B7280',
    dark: '#374151',
    darker: '#1F2937',
  },
};

const Container = styled(YStack, {
  flex: 1,
});

const Header = styled(XStack, {
  padding: tokens.space.lg,
  justifyContent: 'space-between',
  alignItems: 'center',
});

const HeroSection = styled(YStack, {
  alignItems: 'center',
  gap: tokens.space.md,
  paddingVertical: tokens.space.xl,
  paddingHorizontal: tokens.space.lg,
});

export default function PaywallScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { products, purchaseProduct, subscriptionTier } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<'monthly' | 'annual'>('annual');

  // If already premium, go back
  React.useEffect(() => {
    if (subscriptionTier === 'premium') {
      router.back();
    }
  }, [subscriptionTier]);

  const handleClose = async () => {
    await markPaywallShown();
    router.back();
  };

  const handlePurchase = async () => {
    if (!products || products.length === 0) {
      Alert.alert(t('error'), t('unableToLoadSubscriptions'));
      return;
    }

    setIsLoading(true);

    try {
      // Get the product to purchase
      const productToPurchase = products.find((product) => product.type === selectedPackage);

      if (!productToPurchase) {
        Alert.alert(t('error'), t('selectedPackageNotAvailable'));
        setIsLoading(false);
        return;
      }

      const success = await purchaseProduct(productToPurchase.productId);

      if (success) {
        // Purchase successful - let the useEffect at line 72-76 handle navigation
        // The subscriptionTier will update and trigger automatic navigation
        // This prevents race conditions with state updates
      } else {
        Alert.alert(t('error'), t('purchaseFailed'));
      }
    } catch (error: any) {
      Alert.alert(t('error'), t('purchaseFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    // This is handled in settings
    Alert.alert(
      t('restorePurchases'),
      t('restorePurchasesMessage'),
      [{ text: t('ok') }]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme === 'dark' ? tokens.color.dark.background : tokens.color.light.background }} edges={['top']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Container backgroundColor={theme === 'dark' ? tokens.color.dark.background : tokens.color.light.background}>
        {/* Header */}
        <Header>
          <Text fontSize={28} fontWeight="bold" color={theme === 'dark' ? tokens.color.dark.text : tokens.color.light.text}>
            {t('upgradeToPremium')}
          </Text>
          <Button
            icon={<X size={24} color={colors.gray.main} />}
            padding={tokens.space.sm}
            circular
            chromeless
            onPress={handleClose}
            disabled={isLoading}
          />
        </Header>

        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack paddingHorizontal={tokens.space.lg} gap={tokens.space.lg} paddingBottom={tokens.space.xl}>
            {/* Hero Section */}
            <HeroSection>
              <YStack
                backgroundColor={colors.yellow.light}
                padding={tokens.space.lg}
                borderRadius={100}
                marginBottom={tokens.space.sm}
              >
                <Crown size={64} color={colors.yellow.dark} />
              </YStack>
              <Text fontSize={32} fontWeight="800" textAlign="center" color={theme === 'dark' ? tokens.color.dark.text : tokens.color.light.text}>
                {t('unlockPremium')}
              </Text>
              <Text fontSize={18} color={theme === 'dark' ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary} textAlign="center" lineHeight={24}>
                {t('getMostOutOfLearning')}
              </Text>
            </HeroSection>

            {/* Benefits */}
            <YStack gap={tokens.space.md}>
              <XStack
                gap={tokens.space.md}
                alignItems="flex-start"
                padding={tokens.space.lg}
                backgroundColor={theme === 'dark' ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground}
                borderRadius={tokens.radius.lg}
                borderWidth={1}
                borderColor={theme === 'dark' ? tokens.color.dark.border : tokens.color.light.border}
              >
                <YStack
                  backgroundColor={colors.blue.light}
                  padding={tokens.space.sm}
                  borderRadius={tokens.radius.md}
                  alignSelf="flex-start"
                >
                  <Zap size={24} color={colors.blue.main} />
                </YStack>
                <YStack flex={1} gap={tokens.space.xs}>
                  <Text fontSize={18} fontWeight="700" color={theme === 'dark' ? tokens.color.dark.text : tokens.color.light.text}>
                    {t('adFreeExperience')}
                  </Text>
                  <Text fontSize={14} color={theme === 'dark' ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary} lineHeight={20}>
                    {t('adFreeDescription')}
                  </Text>
                </YStack>
              </XStack>

              <XStack
                gap={tokens.space.md}
                alignItems="flex-start"
                padding={tokens.space.lg}
                backgroundColor={theme === 'dark' ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground}
                borderRadius={tokens.radius.lg}
                borderWidth={1}
                borderColor={theme === 'dark' ? tokens.color.dark.border : tokens.color.light.border}
              >
                <YStack
                  backgroundColor={colors.green.light}
                  padding={tokens.space.sm}
                  borderRadius={tokens.radius.md}
                  alignSelf="flex-start"
                >
                  <Bell size={24} color={colors.green.main} />
                </YStack>
                <YStack flex={1} gap={tokens.space.xs}>
                  <Text fontSize={18} fontWeight="700" color={theme === 'dark' ? tokens.color.dark.text : tokens.color.light.text}>
                    {t('upTo3FactsPerDay')}
                  </Text>
                  <Text fontSize={14} color={theme === 'dark' ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary} lineHeight={20}>
                    {t('upTo3FactsDescription')}
                  </Text>
                </YStack>
              </XStack>

              <XStack
                gap={tokens.space.md}
                alignItems="flex-start"
                padding={tokens.space.lg}
                backgroundColor={theme === 'dark' ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground}
                borderRadius={tokens.radius.lg}
                borderWidth={1}
                borderColor={theme === 'dark' ? tokens.color.dark.border : tokens.color.light.border}
              >
                <YStack
                  backgroundColor={colors.purple.light}
                  padding={tokens.space.sm}
                  borderRadius={tokens.radius.md}
                  alignSelf="flex-start"
                >
                  <Star size={24} color={colors.purple.main} />
                </YStack>
                <YStack flex={1} gap={tokens.space.xs}>
                  <Text fontSize={18} fontWeight="700" color={theme === 'dark' ? tokens.color.dark.text : tokens.color.light.text}>
                    {t('supportDevelopment')}
                  </Text>
                  <Text fontSize={14} color={theme === 'dark' ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary} lineHeight={20}>
                    {t('supportDevelopmentDescription')}
                  </Text>
                </YStack>
              </XStack>
            </YStack>

            <Separator
              marginVertical={tokens.space.sm}
              backgroundColor={theme === 'dark' ? tokens.color.dark.border : tokens.color.light.border}
            />

            {/* Pricing Options */}
            <YStack gap={tokens.space.md}>
              <Text fontSize={24} fontWeight="800" color={theme === 'dark' ? tokens.color.dark.text : tokens.color.light.text}>
                {t('chooseYourPlan')}
              </Text>

              {/* Annual Option */}
              <Pressable onPress={() => setSelectedPackage('annual')}>
                <YStack
                  padding={tokens.space.lg}
                  borderRadius={tokens.radius.lg}
                  borderWidth={2}
                  gap={tokens.space.sm}
                  backgroundColor={
                    selectedPackage === 'annual'
                      ? theme === 'dark'
                        ? colors.blue.dark + '20'
                        : colors.blue.light
                      : theme === 'dark'
                      ? tokens.color.dark.cardBackground
                      : tokens.color.light.cardBackground
                  }
                  borderColor={
                    selectedPackage === 'annual'
                      ? colors.blue.main
                      : theme === 'dark'
                      ? tokens.color.dark.border
                      : tokens.color.light.border
                  }
                >
                  <XStack justifyContent="space-between" alignItems="center">
                    <XStack gap={tokens.space.sm} alignItems="center">
                      {selectedPackage === 'annual' && (
                        <YStack
                          backgroundColor={colors.blue.main}
                          padding={tokens.space.xs}
                          borderRadius={100}
                        >
                          <Check size={16} color="white" />
                        </YStack>
                      )}
                      <Text
                        fontSize={20}
                        fontWeight="700"
                        color={
                          selectedPackage === 'annual'
                            ? colors.blue.accent
                            : theme === 'dark'
                            ? tokens.color.dark.text
                            : tokens.color.light.text
                        }
                      >
                        {t('annual')}
                      </Text>
                    </XStack>
                    <YStack
                      backgroundColor={colors.green.main}
                      paddingHorizontal={tokens.space.sm}
                      paddingVertical={tokens.space.xs}
                      borderRadius={tokens.radius.sm}
                    >
                      <Text fontSize={10} fontWeight="800" color="white">
                        {t('save2Months')}
                      </Text>
                    </YStack>
                  </XStack>
                  <Text
                    fontSize={28}
                    fontWeight="800"
                    color={
                      selectedPackage === 'annual'
                        ? colors.blue.accent
                        : theme === 'dark'
                        ? tokens.color.dark.text
                        : tokens.color.light.text
                    }
                  >
                    $29.88/year
                  </Text>
                  <Text fontSize={16} color={theme === 'dark' ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary}>
                    {t('justPerMonth').replace('{price}', '$2.49')}
                  </Text>
                </YStack>
              </Pressable>

              {/* Monthly Option */}
              <Pressable onPress={() => setSelectedPackage('monthly')}>
                <YStack
                  padding={tokens.space.lg}
                  borderRadius={tokens.radius.lg}
                  borderWidth={2}
                  gap={tokens.space.sm}
                  backgroundColor={
                    selectedPackage === 'monthly'
                      ? theme === 'dark'
                        ? colors.blue.dark + '20'
                        : colors.blue.light
                      : theme === 'dark'
                      ? tokens.color.dark.cardBackground
                      : tokens.color.light.cardBackground
                  }
                  borderColor={
                    selectedPackage === 'monthly'
                      ? colors.blue.main
                      : theme === 'dark'
                      ? tokens.color.dark.border
                      : tokens.color.light.border
                  }
                >
                  <XStack gap={tokens.space.sm} alignItems="center">
                    {selectedPackage === 'monthly' && (
                      <YStack
                        backgroundColor={colors.blue.main}
                        padding={tokens.space.xs}
                        borderRadius={100}
                      >
                        <Check size={16} color="white" />
                      </YStack>
                    )}
                    <Text
                      fontSize={20}
                      fontWeight="700"
                      color={
                        selectedPackage === 'monthly'
                          ? colors.blue.accent
                          : theme === 'dark'
                          ? tokens.color.dark.text
                          : tokens.color.light.text
                      }
                    >
                      {t('monthly')}
                    </Text>
                  </XStack>
                  <Text
                    fontSize={28}
                    fontWeight="800"
                    color={
                      selectedPackage === 'monthly'
                        ? colors.blue.accent
                        : theme === 'dark'
                        ? tokens.color.dark.text
                        : tokens.color.light.text
                    }
                  >
                    $2.99/month
                  </Text>
                </YStack>
              </Pressable>
            </YStack>

            {/* Purchase Button */}
            <Button
              onPress={handlePurchase}
              disabled={isLoading || products.length === 0}
              marginTop={tokens.space.sm}
              paddingVertical={tokens.space.lg}
              borderRadius={tokens.radius.md}
              backgroundColor={colors.blue.main}
              pressStyle={{ backgroundColor: colors.blue.dark }}
            >
              <Text fontSize={20} fontWeight="800" color="white">
                {isLoading ? t('processing') : t('startPremium')}
              </Text>
            </Button>

            {/* Restore Button */}
            <Button
              chromeless
              onPress={handleRestore}
              disabled={isLoading}
              paddingVertical={tokens.space.md}
            >
              <Text
                fontSize={16}
                color={colors.blue.main}
                fontWeight="600"
              >
                {t('restorePurchases')}
              </Text>
            </Button>

            {/* Terms */}
            <Text fontSize={12} color={colors.gray.main} textAlign="center" lineHeight={18} paddingTop={tokens.space.sm}>
              {t('subscriptionAutoRenews').replace('{platform}', Platform.OS === 'ios' ? 'iTunes' : 'Google Play')}
            </Text>
          </YStack>
        </ScrollView>
      </Container>
    </SafeAreaView>
  );
}
