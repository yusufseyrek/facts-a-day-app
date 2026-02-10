import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { i18n } from '../i18n/config';

import { FONT_FAMILIES } from './Typography';

// Hardcoded values — this component renders outside Tamagui context (like ErrorBoundary)
const SPACING = { sm: 8, md: 12, lg: 16, xl: 24 };
const RADIUS = { lg: 16 };

interface AppCheckBlockingScreenProps {
  onRetry: () => Promise<void>;
  isRetrying: boolean;
}

export function AppCheckBlockingScreen({ onRetry, isRetrying }: AppCheckBlockingScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🛡️</Text>
        <Text style={styles.title}>{i18n.t('appCheckFailedTitle')}</Text>
        <Text style={styles.message}>{i18n.t('appCheckFailedMessage')}</Text>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>{i18n.t('tryAgain')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    backgroundColor: '#0A1628',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  emoji: {
    fontSize: 64,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: FONT_FAMILIES.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  message: {
    fontSize: 16,
    fontFamily: FONT_FAMILIES.regular,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#6366F1',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    minWidth: 200,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: FONT_FAMILIES.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
