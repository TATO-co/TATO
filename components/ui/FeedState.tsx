import { ActivityIndicator, Pressable, Text, View } from 'react-native';

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
            <View className="items-center justify-center rounded-[24px] border border-tato-line bg-tato-panel p-8">
                <ActivityIndicator color="#1e6dff" />
                <Text className="mt-3 text-sm text-tato-muted">Loading...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View className="items-center justify-center rounded-[24px] border border-tato-line bg-tato-panel p-8">
                <Text className="text-center text-sm text-tato-error">{error}</Text>
                {onRetry ? (
                    <Pressable
                        accessibilityLabel="Retry loading"
                        accessibilityRole="button"
                        className="mt-3 rounded-full bg-tato-accent px-4 py-2 hover:bg-tato-accentStrong focus:bg-tato-accentStrong"
                        onPress={onRetry}>
                        <Text className="font-mono text-xs font-semibold uppercase tracking-[1px] text-white">
                            Retry
                        </Text>
                    </Pressable>
                ) : null}
            </View>
        );
    }

    if (empty) {
        return (
            <View className="items-center justify-center rounded-[24px] border border-tato-line bg-tato-panel p-8">
                <Text className="text-center text-sm text-tato-muted">
                    {emptyLabel ?? 'Nothing here yet.'}
                </Text>
            </View>
        );
    }

    return null;
}
