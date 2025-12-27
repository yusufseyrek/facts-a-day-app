import React, { useState, useCallback, useRef, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  RefreshControl, 
  ActivityIndicator,
  Pressable,
  View,
  Animated as RNAnimated,
} from 'react-native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { styled, Text as TamaguiText } from '@tamagui/core';
import { YStack, XStack } from 'tamagui';
import { 
  ChevronLeft,
  ChevronRight,
  Calendar,
  Shuffle,
} from '@tamagui/lucide-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import { tokens } from '../../src/theme/tokens';
import { H2, FONT_FAMILIES } from '../../src/components/Typography';
import { SectionHeaderContainer } from '../../src/components/ScreenLayout';
import { useTheme } from '../../src/theme';
import { useTranslation } from '../../src/i18n';
import { getLucideIcon } from '../../src/utils/iconMapper';
import * as triviaService from '../../src/services/trivia';
import { TriviaResults, getTriviaModeBadge } from '../../src/components/trivia';
import type { TriviaSessionWithCategory } from '../../src/services/trivia';
import { trackScreenView, Screens, trackTriviaResultsView, TriviaMode } from '../../src/services/analytics';
import { FLASH_LIST_SETTINGS } from '../../src/config/factListSettings';

// Styled Text components
const Text = styled(TamaguiText, {
  fontFamily: FONT_FAMILIES.regular,
  color: '$text',
});

// Back Button with press animation
function BackButton({ 
  onPress, 
  primaryColor 
}: { 
  onPress: () => void; 
  primaryColor: string;
}) {
  const scale = useRef(new RNAnimated.Value(1)).current;

  const handlePressIn = () => {
    RNAnimated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  };

  const handlePressOut = () => {
    RNAnimated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <RNAnimated.View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: `${primaryColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
          transform: [{ scale }],
        }}
      >
        <ChevronLeft size={24} color={primaryColor} />
      </RNAnimated.View>
    </Pressable>
  );
}

// Session Card Component (unified with performance view)
function SessionCard({
  session,
  isDark,
  t,
  onPress,
  dateFormat = 'time',
}: {
  session: TriviaSessionWithCategory;
  isDark: boolean;
  t: (key: any, params?: any) => string;
  onPress?: () => void;
  dateFormat?: 'time' | 'relative';
}) {
  const cardBg = isDark ? tokens.color.dark.cardBackground : tokens.color.light.cardBackground;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const secondaryTextColor = isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary;
  const successColor = isDark ? tokens.color.dark.success : tokens.color.light.success;
  const warningColor = '#F59E0B';
  const errorColor = isDark ? tokens.color.dark.error : tokens.color.light.error;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;

  const scorePercentage = session.total_questions > 0 
    ? (session.correct_answers / session.total_questions) * 100 
    : 0;

  const getFeedback = () => {
    if (scorePercentage >= 90) {
      return { text: t('perfectScore'), color: successColor };
    } else if (scorePercentage >= 70) {
      return { text: t('greatJob'), color: successColor };
    } else if (scorePercentage >= 50) {
      return { text: t('goodEffort'), color: warningColor };
    } else {
      return { text: t('keepPracticing'), color: errorColor };
    }
  };

  const feedback = getFeedback();

  const formatTimeOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `${t('today')}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return t('yesterday');
    } else {
      return t('daysAgo', { count: diffDays });
    }
  };

  const getDateDisplay = () => {
    return dateFormat === 'relative' 
      ? formatRelativeDate(session.completed_at) 
      : formatTimeOnly(session.completed_at);
  };

  const getDisplayName = () => {
    if (session.category) {
      return session.category.name;
    }
    switch (session.trivia_mode) {
      case 'daily':
        return t('dailyTrivia');
      case 'mixed':
        return t('mixedTrivia');
      default:
        return t('trivia');
    }
  };

  const getIcon = () => {
    if (session.category) {
      const iconColor = session.category.color_hex || primaryColor;
      return (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: `${iconColor}20`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {getLucideIcon(session.category.icon, 22, iconColor)}
        </View>
      );
    }
    
    const IconComponent = session.trivia_mode === 'daily' ? Calendar : Shuffle;
    const iconColor = primaryColor;
    
    return (
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: `${iconColor}20`,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <IconComponent size={22} color={iconColor} />
      </View>
    );
  };

  const hasResultData = session.questions_json && session.answers_json;

  return (
    <Pressable 
      onPress={hasResultData ? onPress : undefined}
      style={({ pressed }) => [
        pressed && hasResultData && { opacity: 0.8 }
      ]}
    >
      <XStack
        backgroundColor={cardBg}
        borderRadius={tokens.radius.lg}
        padding={tokens.space.lg}
        alignItems="center"
        gap={tokens.space.sm}
      >
        {getIcon()}
        <YStack flex={1} gap={2}>
          <Text
            fontSize={16}
            fontFamily={FONT_FAMILIES.semibold}
            color={textColor}
          >
            {getDisplayName()}
          </Text>
          <Text
            fontSize={13}
            color={secondaryTextColor}
          >
            {getDateDisplay()}
          </Text>
        </YStack>
        <YStack alignItems="flex-end" gap={2}>
          <Text
            fontSize={14}
            fontFamily={FONT_FAMILIES.semibold}
            color={feedback.color}
          >
            {feedback.text}
          </Text>
          <Text
            fontSize={13}
            color={secondaryTextColor}
          >
            {t('score')}: {session.correct_answers}/{session.total_questions}
          </Text>
        </YStack>
        {hasResultData && (
          <ChevronRight size={20} color={secondaryTextColor} />
        )}
      </XStack>
    </Pressable>
  );
}

// Type for section data (used internally for grouping)
interface SessionSection {
  title: string;
  data: TriviaSessionWithCategory[];
}

// FlashList item types
const ITEM_TYPES = {
  SECTION_HEADER: 'sectionHeader',
  SESSION_ITEM: 'sessionItem',
} as const;

interface SectionHeaderItem {
  type: typeof ITEM_TYPES.SECTION_HEADER;
  title: string;
}

interface SessionItem {
  type: typeof ITEM_TYPES.SESSION_ITEM;
  session: TriviaSessionWithCategory;
  index: number;
}

type HistoryListItem = SectionHeaderItem | SessionItem;

export default function ActivityHistoryScreen() {
  const { theme } = useTheme();
  const { t, locale } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sections, setSections] = useState<SessionSection[]>([]);
  const [selectedSession, setSelectedSession] = useState<TriviaSessionWithCategory | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  // Flatten sections into a single array for FlashList
  const { flattenedData, stickyHeaderIndices } = useMemo(() => {
    const items: HistoryListItem[] = [];
    const headerIndices: number[] = [];
    let itemIndex = 0;

    sections.forEach((section) => {
      // Add section header
      headerIndices.push(items.length);
      items.push({
        type: ITEM_TYPES.SECTION_HEADER,
        title: section.title,
      });

      // Add session items
      section.data.forEach((session) => {
        items.push({
          type: ITEM_TYPES.SESSION_ITEM,
          session,
          index: itemIndex++,
        });
      });
    });

    return { flattenedData: items, stickyHeaderIndices: headerIndices };
  }, [sections]);

  // Group sessions by date
  const groupSessionsByDate = useCallback((sessions: TriviaSessionWithCategory[]): SessionSection[] => {
    const grouped: Record<string, TriviaSessionWithCategory[]> = {};
    
    sessions.forEach(session => {
      const date = new Date(session.completed_at);
      const dateKey = date.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(session);
    });

    // Convert to sections array, maintaining order (most recent first)
    return Object.entries(grouped).map(([title, data]) => ({
      title,
      data,
    }));
  }, [locale]);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      
      const allSessions = await triviaService.getAllSessions();
      const groupedSections = groupSessionsByDate(allSessions);
      setSections(groupedSections);
    } catch (error) {
      // Ignore history loading errors
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupSessionsByDate]);

  useFocusEffect(
    useCallback(() => {
      trackScreenView(Screens.TRIVIA_HISTORY);
      loadData();
    }, [loadData])
  );

  const handleSessionClick = useCallback(async (sessionId: number) => {
    try {
      setLoadingSession(true);
      const fullSession = await triviaService.getSessionById(sessionId);
      if (fullSession && fullSession.questions && fullSession.answers) {
        setSelectedSession(fullSession);
        // Track viewing results from history
        trackScreenView(Screens.TRIVIA_RESULTS);
        trackTriviaResultsView({
          mode: fullSession.trivia_mode as TriviaMode,
          sessionId: fullSession.id,
          categorySlug: fullSession.category_slug || undefined,
        });
      }
    } catch (error) {
      // Ignore session loading errors
    } finally {
      setLoadingSession(false);
    }
  }, []);

  const handleCloseResults = useCallback(() => {
    setSelectedSession(null);
  }, []);

  // FlashList key extractor
  const keyExtractor = useCallback((item: HistoryListItem, index: number) => {
    if (item.type === ITEM_TYPES.SECTION_HEADER) {
      return `header-${item.title}-${index}`;
    }
    return `session-${item.session.id}`;
  }, []);

  // FlashList renderItem
  const renderItem = useCallback(({ item }: ListRenderItemInfo<HistoryListItem>) => {
    if (item.type === ITEM_TYPES.SECTION_HEADER) {
      return (
        <SectionHeaderContainer paddingTop={tokens.space.md}>
          <H2>{item.title}</H2>
        </SectionHeaderContainer>
      );
    }
    
    return (
      <Animated.View entering={FadeInDown.delay(item.index * 30).duration(350).springify()}>
        <View style={{ paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.xs }}>
          <SessionCard
            session={item.session}
            isDark={isDark}
            t={t}
            onPress={() => handleSessionClick(item.session.id)}
          />
        </View>
      </Animated.View>
    );
  }, [isDark, t, handleSessionClick]);

  // FlashList getItemType
  const getItemType = useCallback((item: HistoryListItem) => {
    return item.type;
  }, []);

  // Colors
  const bgColor = isDark ? tokens.color.dark.background : tokens.color.light.background;
  const textColor = isDark ? '#FFFFFF' : tokens.color.light.text;
  const primaryColor = isDark ? tokens.color.dark.primary : tokens.color.light.primary;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <YStack flex={1} justifyContent="center" alignItems="center">
          <ActivityIndicator size="large" color={primaryColor} />
        </YStack>
      </View>
    );
  }

  // Show results view for selected session
  if (selectedSession && selectedSession.questions && selectedSession.answers) {
    const wrongCount = selectedSession.total_questions - selectedSession.correct_answers;
    
    const formatSessionDateTime = (dateString: string) => {
      const date = new Date(dateString);
      const dateStr = date.toLocaleDateString(locale, { 
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
      const timeStr = date.toLocaleTimeString(locale, { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      return `${dateStr} • ${timeStr}`;
    };
    
    return (
      <TriviaResults
        correctAnswers={selectedSession.correct_answers}
        totalQuestions={selectedSession.total_questions}
        wrongCount={wrongCount}
        unansweredCount={0}
        timeExpired={false}
        elapsedTime={selectedSession.elapsed_time || 0}
        bestStreak={selectedSession.best_streak || 0}
        questions={selectedSession.questions}
        answers={selectedSession.answers}
        onClose={handleCloseResults}
        isDark={isDark}
        t={t}
        customTitle={t('testResults')}
        customSubtitle={formatSessionDateTime(selectedSession.completed_at)}
        triviaModeBadge={getTriviaModeBadge({
          mode: selectedSession.trivia_mode,
          categoryName: selectedSession.category?.name,
          categoryIcon: selectedSession.category?.icon,
          categoryColor: selectedSession.category?.color_hex,
          isDark,
          t,
        })}
        showBackButton={true}
        showReturnButton={false}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bgColor }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(400).springify()}>
        <XStack
          paddingTop={insets.top + tokens.space.sm}
          paddingBottom={tokens.space.md}
          paddingHorizontal={tokens.space.lg}
          alignItems="center"
          justifyContent="space-between"
          borderBottomWidth={1}
          borderBottomColor={isDark ? tokens.color.dark.border : tokens.color.light.border}
        >
          <BackButton onPress={() => router.back()} primaryColor={primaryColor} />
          
          <Text
            fontSize={20}
            fontFamily={FONT_FAMILIES.bold}
            color={textColor}
          >
            {t('testHistory')}
          </Text>
          
          {/* Empty spacer to balance the header */}
          <View style={{ width: 36, height: 36 }} />
        </XStack>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(50).duration(400).springify()} style={{ flex: 1 }}>
        {flattenedData.length === 0 ? (
          <YStack flex={1} justifyContent="center" alignItems="center" paddingTop={100}>
            <Text
              fontSize={16}
              color={isDark ? tokens.color.dark.textSecondary : tokens.color.light.textSecondary}
            >
              {t('noTestsYet')}
            </Text>
          </YStack>
        ) : (
          <FlashList
            data={flattenedData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            getItemType={getItemType}
            stickyHeaderIndices={stickyHeaderIndices}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />
            }
            contentContainerStyle={{ 
              paddingBottom: tokens.space.sm,
            }}
            {...FLASH_LIST_SETTINGS}
          />
        )}
      </Animated.View>

      {/* Loading overlay for session fetch */}
      {loadingSession && (
        <View 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      )}
    </View>
  );
}
