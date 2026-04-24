import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { getUserSafeErrorMessage } from '@/lib/errorMessages';
import { useNotifications } from '@/lib/hooks/useNotifications';

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'now';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function NotificationFeed({ limit = 4 }: { limit?: number }) {
  const { notifications, loading, error, refresh } = useNotifications();
  const visibleNotifications = notifications.slice(0, limit);

  return (
    <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
            Activity Feed
          </Text>
          <Text className="mt-2 text-lg font-sans-bold text-tato-text">
            Cross-persona updates
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Refresh activity feed"
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-full border border-tato-line bg-tato-panelSoft"
          onPress={() => {
            void refresh();
          }}>
          <PlatformIcon color="#8ea4c8" name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} size={16} />
        </Pressable>
      </View>

      <View className="mt-4 gap-3">
        {loading ? (
          <View className="items-center justify-center py-4">
            <ActivityIndicator color="#1e6dff" />
            <Text className="mt-2 text-sm text-tato-muted">Loading...</Text>
          </View>
        ) : error ? (
          <Pressable
            accessibilityLabel="Retry activity feed"
            accessibilityRole="button"
            className="rounded-[18px] border border-tato-error/30 bg-tato-error/10 px-4 py-3"
            onPress={() => {
              void refresh();
            }}>
            <Text className="text-sm text-tato-error">
              {getUserSafeErrorMessage(error, 'Activity updates are unavailable. Pull to refresh.')}
            </Text>
          </Pressable>
        ) : !visibleNotifications.length ? (
          <Text className="rounded-[18px] border border-dashed border-tato-line px-4 py-3 text-sm text-tato-muted">
            No handoff updates yet.
          </Text>
        ) : null}
        {visibleNotifications.map((notification) => {
          const row = (
            <Pressable
              accessibilityLabel={notification.title}
              accessibilityRole="button"
              className="rounded-[18px] border border-tato-lineSoft bg-tato-panelSoft px-4 py-3 hover:bg-tato-hover focus:bg-tato-hover">
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-tato-text" numberOfLines={2}>
                    {notification.title}
                  </Text>
                  <Text className="mt-1 text-xs leading-5 text-tato-muted" numberOfLines={3}>
                    {notification.body}
                  </Text>
                </View>
                <Text className="max-w-[88px] text-right font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                  {formatNotificationTime(notification.createdAt)}
                </Text>
              </View>
            </Pressable>
          );

          if (notification.actionHref) {
            return (
              <Link asChild href={notification.actionHref as never} key={notification.id}>
                {row}
              </Link>
            );
          }

          return <View key={notification.id}>{row}</View>;
        })}
      </View>
    </View>
  );
}
