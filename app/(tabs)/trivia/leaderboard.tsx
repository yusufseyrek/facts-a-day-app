import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ContentContainer } from '../../../src/components';
import { PullToRefresh } from '../../../src/components/home/PullToRefresh';
import { TriviaLeaderboard } from '../../../src/components/trivia';
import { trackScreenView } from '../../../src/services/analytics';
import { hexColors, useTheme } from '../../../src/theme';
import { useResponsive } from '../../../src/utils/useResponsive';

/**
 * Dedicated leaderboard screen (header trophy button on the trivia tab).
 * Hosts the shared board card with a screen-sized entry limit; the card owns
 * its own loading/error/empty states and the claim-a-name CTA.
 */
export default function TriviaLeaderboardScreen() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { spacing } = useResponsive();
  const bgColor = isDark ? hexColors.dark.background : hexColors.light.background;

  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      trackScreenView('TriviaLeaderboard');
      setReloadToken((n) => n + 1);
    }, [])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadToken((n) => n + 1);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setRefreshing(false);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <PullToRefresh refreshing={refreshing} onRefresh={handleRefresh}>
        {(scrollProps) => (
          <ScrollView
            {...scrollProps}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
          >
            <ContentContainer>
              <View style={{ marginVertical: spacing.lg }}>
                <TriviaLeaderboard reloadToken={reloadToken} limit={50} onLoadEnd={handleLoadEnd} />
              </View>
            </ContentContainer>
          </ScrollView>
        )}
      </PullToRefresh>
    </View>
  );
}
