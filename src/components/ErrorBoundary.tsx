import React, { Component, ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { captureException } from '../config/sentry';
import { tokens } from '../theme/tokens';
import { H1, BodyText, LabelText, SmallText } from './Typography';

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
 * logs those errors to Sentry, and displays a fallback UI.
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
    // Log error to Sentry
    captureException(error, {
      errorInfo: {
        componentStack: errorInfo.componentStack,
      },
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

      // Default fallback UI
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <H1 style={styles.emoji}>😔</H1>
            <H1 textAlign="center" color={tokens.color.light.text} style={{ marginBottom: tokens.space.md }}>
              Oops! Something went wrong
            </H1>
            <BodyText textAlign="center" color={tokens.color.light.textSecondary} style={{ marginBottom: tokens.space.xl }}>
              We've been notified and will fix this soon.
            </BodyText>

            {__DEV__ && this.state.error && (
              <View style={styles.errorDetails}>
                <LabelText color="#DC2626" style={{ marginBottom: tokens.space.sm }}>
                  Error Details (Dev Only):
                </LabelText>
                <SmallText color="#991B1B" style={{ fontFamily: 'monospace' }}>
                  {this.state.error.toString()}
                </SmallText>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              onPress={this.resetError}
            >
              <LabelText textAlign="center" color="#FFFFFF">Try Again</LabelText>
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
    padding: tokens.space.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  emoji: {
    fontSize: 64,
    marginBottom: tokens.space.lg,
  },
  errorDetails: {
    backgroundColor: '#FEF2F2',
    borderRadius: tokens.radius.md,
    padding: tokens.space.md,
    marginBottom: tokens.space.xl,
    width: '100%',
  },
  button: {
    backgroundColor: tokens.color.light.primary,
    paddingHorizontal: tokens.space.xl,
    paddingVertical: tokens.space.md,
    borderRadius: tokens.radius.lg,
    minWidth: 200,
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
