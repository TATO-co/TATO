import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type NotificationPayload = {
  recipientProfileId: string | null | undefined;
  actorProfileId?: string | null;
  itemId?: string | null;
  claimId?: string | null;
  eventType: string;
  title: string;
  body: string;
  actionHref?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeUserNotification(
  admin: SupabaseClient,
  payload: NotificationPayload,
) {
  if (!payload.recipientProfileId) {
    return;
  }

  const { error } = await admin.from('user_notifications').insert({
    recipient_profile_id: payload.recipientProfileId,
    actor_profile_id: payload.actorProfileId ?? null,
    item_id: payload.itemId ?? null,
    claim_id: payload.claimId ?? null,
    event_type: payload.eventType,
    title: payload.title,
    body: payload.body,
    action_href: payload.actionHref ?? null,
    metadata: payload.metadata ?? {},
  });

  if (error) {
    console.error('user_notification_insert_failed', {
      eventType: payload.eventType,
      recipientProfileId: payload.recipientProfileId,
      itemId: payload.itemId,
      claimId: payload.claimId,
      message: error.message,
    });
  }
}
