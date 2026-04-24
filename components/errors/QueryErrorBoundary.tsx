import { QueryErrorResetBoundary } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ScreenErrorBoundary } from '@/components/errors/ScreenErrorBoundary';

type QueryErrorBoundaryProps = {
  children: ReactNode;
  screenName: string;
  userId?: string | null;
};

export function QueryErrorBoundary({ children, screenName, userId }: QueryErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ScreenErrorBoundary onRetry={reset} screenName={screenName} userId={userId}>
          {children}
        </ScreenErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
