import { ActivityIndicator, Text, View } from 'react-native';

import { TatoButton } from '@/components/ui/TatoButton';
import { getUserSafeErrorMessage } from '@/lib/errorMessages';

type FeedStateProps = {
    /** True while the initial load is in progress (not a background refresh). */
    loading?: boolean;
    /** Human-readable error message to display. */
    error?: string | null;
    /** Whether the dataset is empty (after loading). */
    empty?: boolean;
    /** Label shown when the dataset is empty. */
    emptyLabel?: string;
    /** Called when the user presses the retry button in the error state. */
    onRetry?: () => void;
};

/**
 * Shared loading / error / empty state component.
 *
 * Returns `null` when none of the states apply, so it can be used inline with
 * a nullish coalescing operator:
 *
 *   {renderFeedState() ?? <ActualContent />}
 */
export function FeedState({ loading, error, empty, emptyLabel, onRetry }: FeedStateProps) {
    if (loading) {
        return (
            <View aria-live="polite" className="items-center justify-center rounded-[24px] border border-tato-line bg-tato-panel p-8" testID="feed-state-loading">
                <ActivityIndicator color="#1e6dff" />
                <Text className="mt-3 text-sm text-tato-muted">Loading...</Text>
            </View>
        );
    }

    if (error) {
        const safeError = getUserSafeErrorMessage(error, 'Something went wrong. Pull to refresh or retry.');

        return (
            <View aria-live="polite" className="items-center justify-center rounded-[24px] border border-tato-line bg-tato-panel p-8" testID="feed-state-error">
                <Text className="text-center text-sm text-tato-error">{safeError}</Text>
                {onRetry ? (
                    <TatoButton
                        accessibilityLabel="Retry loading"
                        className="mt-3 self-center"
                        label="Retry"
                        onPress={onRetry}
                        size="sm"
                        testID="feed-state-retry"
                    />
                ) : null}
            </View>
        );
    }

    if (empty) {
        return (
            <View aria-live="polite" className="items-center justify-center rounded-[24px] border border-tato-line bg-tato-panel p-8" testID="feed-state-empty">
                <Text className="text-center text-sm text-tato-muted">
                    {emptyLabel ?? 'Nothing here yet.'}
                </Text>
            </View>
        );
    }

    return null;
}
