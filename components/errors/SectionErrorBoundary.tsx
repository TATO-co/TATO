import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { captureException } from '@/lib/analytics';
import { getUserSafeErrorMessage } from '@/lib/errorMessages';

type SectionErrorAction = {
  label: string;
  onPress: () => void;
};

type SectionErrorBoundaryProps = {
  children: ReactNode;
  title: string;
  description: string;
  action?: SectionErrorAction;
  error?: unknown;
  sectionName?: string;
};

type InnerBoundaryProps = Omit<SectionErrorBoundaryProps, 'error'>;

type InnerBoundaryState = {
  error: Error | null;
};

function SectionErrorFallback({
  action,
  description,
  title,
}: {
  action?: SectionErrorAction;
  description: string;
  title: string;
}) {
  return (
    <View
      accessibilityRole="alert"
      className="rounded-[20px] border border-tato-error/30 bg-tato-error/10 p-4">
      <View className="flex-row items-start gap-3">
        <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-tato-error/15">
          <PlatformIcon
            color="#ff8f8f"
            name={{ ios: 'exclamationmark.triangle', android: 'error-outline', web: 'error-outline' }}
            size={16}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-tato-text">{title}</Text>
          <Text className="mt-1 text-sm leading-6 text-tato-muted">{description}</Text>
          {action ? (
            <Pressable
              accessibilityRole="button"
              className="mt-3 self-start px-0 py-2"
              hitSlop={8}
              onPress={action.onPress}>
              <Text className="font-mono text-[11px] font-semibold uppercase tracking-[0.5px] text-tato-error">
                {action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

class InnerSectionErrorBoundary extends Component<InnerBoundaryProps, InnerBoundaryState> {
  state: InnerBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): InnerBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.sectionName ?? this.props.title}]`, error);
    captureException(error, {
      flow: 'section.errorBoundary',
      sectionName: this.props.sectionName ?? this.props.title,
      componentStack: info.componentStack ?? '',
    });
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.action?.onPress();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <SectionErrorFallback
        action={this.props.action ? { ...this.props.action, onPress: this.handleRetry } : undefined}
        description={this.props.description}
        title={this.props.title}
      />
    );
  }
}

export function SectionErrorBoundary({
  action,
  children,
  description,
  error,
  sectionName,
  title,
}: SectionErrorBoundaryProps) {
  const safeDescription = error ? getUserSafeErrorMessage(error, description) : description;

  useEffect(() => {
    if (error) {
      console.error(`[SectionErrorBoundary:${sectionName ?? title}]`, error);
    }
  }, [error, sectionName, title]);

  if (error) {
    return (
      <SectionErrorFallback
        action={action}
        description={safeDescription}
        title={title}
      />
    );
  }

  return (
    <InnerSectionErrorBoundary
      action={action}
      description={description}
      sectionName={sectionName}
      title={title}>
      {children}
    </InnerSectionErrorBoundary>
  );
}
