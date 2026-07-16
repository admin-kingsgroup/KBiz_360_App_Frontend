import { Component, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors } from '../../theme';
import { reportError } from '../../services/crashReporter';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; message?: string; }

// Generic crash boundary so one screen error doesn't take down the app. Logs the error and
// offers a retry that clears the error state (re-mounts children).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : 'Unexpected error' };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
    // Forward to the backend so field crashes are visible (fire-and-forget, never throws).
    const componentStack = (info as { componentStack?: string } | null)?.componentStack;
    reportError(error, componentStack?.slice(0, 300));
  }
  reset = () => this.setState({ hasError: false, message: undefined });
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.canvas }}>
          <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800' }}>Something went wrong</Text>
          <Text style={{ color: colors.warmMute, fontSize: 12, marginTop: 6, textAlign: 'center' }}>{this.state.message}</Text>
          <Pressable onPress={this.reset} style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.ink }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
