import React, { Component, ReactNode } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { recordError } from '../config/firebase';
import { hexColors, spacing, radius } from '../theme';
import { FONT_FAMILIES } from './Typography';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors to Firebase Crashlytics, and displays a fallback UI.
 *
 * NOTE: This component uses plain React Native Text components instead of
 * Tamagui Typography because ErrorBoundary is rendered OUTSIDE the
 * AppThemeProvider/TamaguiProvider, so Tamagui components would fail.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * Custom fallback:
 * ```tsx
 * <ErrorBoundary
 *   fallback={(error, resetError) => (
 *     <CustomErrorScreen error={error} onRetry={resetError} />
 *   )}
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to Firebase Crashlytics
    recordError(error, {
      componentStack: errorInfo.componentStack || 'unknown',
    });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    if (__DEV__) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // If custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      // Default fallback UI using plain React Native components
      // (Tamagui components can't be used here since we're outside AppThemeProvider)
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.emoji}>😔</Text>
            <Text style={styles.title}>Oops! Something went wrong</Text>
            <Text style={styles.body}>
              We've been notified and will fix this soon.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.errorDetails}>
                <Text style={styles.errorLabel}>Error Details (Dev Only):</Text>
                <Text style={styles.errorText}>
                  {this.state.error.toString()}
                </Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              onPress={this.resetError}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.phone.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.phone.lg,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: FONT_FAMILIES.bold,
    color: hexColors.light.text,
    textAlign: 'center',
    marginBottom: spacing.phone.md,
  },
  body: {
    fontSize: 16,
    fontFamily: FONT_FAMILIES.regular,
    color: hexColors.light.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.phone.xl,
    lineHeight: 24,
  },
  errorDetails: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.phone.md,
    padding: spacing.phone.md,
    marginBottom: spacing.phone.xl,
    width: '100%',
  },
  errorLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: FONT_FAMILIES.semibold,
    color: '#DC2626',
    marginBottom: spacing.phone.sm,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#991B1B',
  },
  button: {
    backgroundColor: hexColors.light.primary,
    paddingHorizontal: spacing.phone.xl,
    paddingVertical: spacing.phone.md,
    borderRadius: radius.phone.lg,
    minWidth: 200,
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
