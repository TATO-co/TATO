create table if not exists public.claim_messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists claim_messages_claim_created_idx
  on public.claim_messages (claim_id, created_at asc);
create index if not exists claim_messages_recipient_idx
  on public.claim_messages (recipient_profile_id, read_at, created_at desc);

alter table public.claim_messages enable row level security;

drop policy if exists "claim_messages_select_participants" on public.claim_messages;
create policy "claim_messages_select_participants"
on public.claim_messages for select
using (
  public.current_profile_is_admin()
  or sender_profile_id = auth.uid()
  or recipient_profile_id = auth.uid()
);

drop policy if exists "claim_messages_update_read_by_recipient" on public.claim_messages;

drop policy if exists "claim_messages_insert_service_only" on public.claim_messages;
create policy "claim_messages_insert_service_only"
on public.claim_messages for insert
with check (auth.role() = 'service_role');
