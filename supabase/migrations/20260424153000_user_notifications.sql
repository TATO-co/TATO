create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  claim_id uuid references public.claims(id) on delete set null,
  event_type text not null,
  title text not null,
  body text not null,
  action_href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_recipient_idx
  on public.user_notifications (recipient_profile_id, created_at desc);
create index if not exists user_notifications_item_idx
  on public.user_notifications (item_id, created_at desc)
  where item_id is not null;
create index if not exists user_notifications_claim_idx
  on public.user_notifications (claim_id, created_at desc)
  where claim_id is not null;

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_select_recipient_or_admin" on public.user_notifications;
create policy "user_notifications_select_recipient_or_admin"
on public.user_notifications for select
using (
  public.current_profile_is_admin()
  or recipient_profile_id = auth.uid()
);

drop policy if exists "user_notifications_update_read_by_recipient" on public.user_notifications;

drop policy if exists "user_notifications_service_insert" on public.user_notifications;
create policy "user_notifications_service_insert"
on public.user_notifications for insert
with check (auth.role() = 'service_role');
