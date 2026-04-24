import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { TatoButton } from '@/components/ui/TatoButton';
import { captureException } from '@/lib/analytics';

type ScreenErrorBoundaryProps = {
  children: ReactNode;
  screenName: string;
  userId?: string | null;
  onRetry?: () => void;
};

type ScreenErrorBoundaryState = {
  hasError: boolean;
};

export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  state: ScreenErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ScreenErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, {
      flow: 'screen.errorBoundary',
      screenName: this.props.screenName,
      userId: this.props.userId ?? 'unknown',
      componentStack: info.componentStack ?? '',
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View
        accessibilityRole="alert"
        className="flex-1 items-center justify-center gap-4 bg-tato-base px-6">
        <View className="w-full max-w-[420px] rounded-[22px] border border-tato-line bg-tato-panel p-5">
          <Text className="text-2xl font-sans-bold text-tato-text">Something went wrong</Text>
          <Text className="mt-2 text-sm leading-6 text-tato-muted">
            Retry the screen. If it keeps happening, sign out and come back in.
          </Text>
          <TatoButton
            className="mt-5"
            label="Retry"
            onPress={this.handleRetry}
            size="sm"
          />
        </View>
      </View>
    );
  }
}
