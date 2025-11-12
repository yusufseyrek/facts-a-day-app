import React from 'react';
import { ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styled } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { tokens } from '../theme/tokens';
import { FactCard } from './FactCard';
import { FactActions } from './FactActions';
import { H1 } from './Typography';
import { useTheme } from '../theme';
import type { FactWithRelations } from '../services/database';
import { BannerAd } from './ads';

interface FactModalProps {
  fact: FactWithRelations;
  onClose: () => void;
}

const Container = styled(SafeAreaView, {
  flex: 1,
  backgroundColor: '$background',
});

const Header = styled(XStack, {
  padding: tokens.space.lg,
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottomWidth: 1,
  borderBottomColor: '$border',
  gap: tokens.space.md,
});

const TitleContainer = styled(YStack, {
  flex: 1,
});

const CloseButtonWrapper = styled(YStack, {
  width: 40,
  height: 40,
  borderRadius: tokens.radius.full,
  backgroundColor: '$surface',
  alignItems: 'center',
  justifyContent: 'center',
});

const ContentContainer = styled(ScrollView, {
  flex: 1,
});

const FactCardWrapper = styled(YStack, {
  padding: tokens.space.lg,
});

export function FactModal({ fact, onClose }: FactModalProps) {
  const { theme } = useTheme();

  const handleReadMore = () => {
    if (fact?.source_url) {
      Linking.openURL(fact.source_url).catch((err) => {
        console.error('Failed to open URL:', err);
      });
    }
  };

  return (
    <Container>
      <Header>
        {/* Title */}
        <TitleContainer>
          <H1 fontSize={24} lineHeight={32}>
            {fact.title || fact.content.substring(0, 80) + '...'}
          </H1>
        </TitleContainer>

        {/* Close Button */}
        <Pressable onPress={onClose}>
          <CloseButtonWrapper>
            <X
              size={24}
              color={theme === 'dark' ? '#FFFFFF' : tokens.color.light.text}
            />
          </CloseButtonWrapper>
        </Pressable>
      </Header>

      <ContentContainer>
        <FactCardWrapper>
          <FactCard fact={fact} onReadMore={handleReadMore} />
        </FactCardWrapper>
      </ContentContainer>

      <BannerAd position="modal" />

      <FactActions
        factId={fact.id}
        factTitle={fact.title}
        factContent={fact.content}
      />
    </Container>
  );
}
