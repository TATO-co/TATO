-- TATO foundational schema
-- Covers users, physical hubs, inventory items, broker claims, and money movement.

create extension if not exists pgcrypto;

-- Enums -----------------------------------------------------------------------

create type public.user_default_mode as enum ('supplier', 'broker');
create type public.user_status as enum ('active', 'suspended');

create type public.hub_status as enum ('active', 'paused', 'closed');

create type public.item_digital_status as enum (
  'supplier_draft',
  'ai_ingestion_pending',
  'ai_ingestion_complete',
  'ready_for_claim',
  'claimed',
  'broker_listing_live',
  'buyer_committed',
  'awaiting_hub_payment',
  'paid_at_hub',
  'completed',
  'claim_expired',
  'withdrawn'
);

create type public.physical_custody_status as enum (
  'at_supplier_hub',
  'reserved_for_buyer_pickup',
  'released_to_buyer',
  'returned_to_supplier'
);

create type public.ai_job_status as enum ('pending', 'processing', 'completed', 'failed');

create type public.claim_status as enum (
  'active',
  'listing_generated',
  'listed_externally',
  'buyer_committed',
  'awaiting_pickup',
  'completed',
  'expired',
  'cancelled'
);

create type public.transaction_type as enum (
  'claim_fee',
  'sale_payment',
  'refund',
  'supplier_payout',
  'broker_payout',
  'platform_fee'
);

create type public.transaction_status as enum (
  'pending',
  'authorized',
  'succeeded',
  'failed',
  'refunded',
  'cancelled'
);

-- Shared trigger helpers ------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Users -----------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text not null,
  phone text,
  avatar_url text,
  default_mode public.user_default_mode,
  status public.user_status not null default 'active',
  can_supply boolean not null default false,
  can_broker boolean not null default false,
  stripe_connected_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Physical hubs ---------------------------------------------------------------

create table public.hubs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  status public.hub_status not null default 'active',
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country_code text not null default 'US',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  pickup_instructions text,
  opening_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hubs_supplier_id_idx on public.hubs (supplier_id);
create index hubs_geo_idx on public.hubs (city, state, status);

create trigger hubs_set_updated_at
before update on public.hubs
for each row execute function public.set_updated_at();

-- Items (supplier owned, physically stored at a hub) --------------------------

create table public.items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.profiles(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,

  title text,
  description text,
  category text,
  condition_summary text,

  quantity integer not null default 1 check (quantity > 0),
  bundle_count integer not null default 1 check (bundle_count > 0),

  digital_status public.item_digital_status not null default 'supplier_draft',
  physical_status public.physical_custody_status not null default 'at_supplier_hub',

  floor_price_cents integer check (floor_price_cents >= 0),
  suggested_list_price_cents integer check (suggested_list_price_cents >= 0),
  reserve_price_cents integer check (reserve_price_cents >= 0),

  -- AI touchpoint #1: supplier ingestion and image analysis
  ingestion_ai_status public.ai_job_status not null default 'pending',
  ingestion_ai_model text,
  ingestion_ai_summary text,
  ingestion_ai_confidence numeric(5, 4) check (ingestion_ai_confidence between 0 and 1),
  ingestion_ai_attributes jsonb not null default '{}'::jsonb,
  ingestion_ai_market_snapshot jsonb not null default '{}'::jsonb,
  ingestion_ai_ran_at timestamptz,

  -- media references (stored in Supabase Storage)
  primary_photo_path text,
  photo_paths text[] not null default '{}',

  listed_at timestamptz,
  sold_at timestamptz,
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_supplier_idx on public.items (supplier_id, created_at desc);
create index items_hub_feed_idx on public.items (hub_id, digital_status, created_at desc);
create index items_status_idx on public.items (digital_status, physical_status);

create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

-- Claims (broker control window over supplier inventory) ----------------------

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  broker_id uuid not null references public.profiles(id) on delete restrict,

  status public.claim_status not null default 'active',
  claim_fee_cents integer not null check (claim_fee_cents >= 0),

  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,

  -- AI touchpoint #2: broker listing generation
  listing_ai_status public.ai_job_status not null default 'pending',
  listing_ai_model text,
  listing_ai_title text,
  listing_ai_description text,
  listing_ai_attributes jsonb not null default '{}'::jsonb,
  listing_ai_platform_variants jsonb not null default '{}'::jsonb,
  listing_ai_ran_at timestamptz,

  external_listing_refs jsonb not null default '{}'::jsonb,
  buyer_committed_at timestamptz,
  pickup_due_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint claims_expiry_check check (expires_at > claimed_at)
);

-- One active claim per item at a time.
create unique index claims_one_active_per_item_idx
on public.claims (item_id)
where status in ('active', 'listing_generated', 'listed_externally', 'buyer_committed', 'awaiting_pickup');

create index claims_broker_status_idx on public.claims (broker_id, status, expires_at);
create index claims_item_idx on public.claims (item_id, created_at desc);

create trigger claims_set_updated_at
before update on public.claims
for each row execute function public.set_updated_at();

-- Transactions (Stripe-backed money ledger) -----------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.claims(id) on delete set null,
  item_id uuid not null references public.items(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,

  supplier_id uuid not null references public.profiles(id) on delete restrict,
  broker_id uuid references public.profiles(id) on delete set null,

  transaction_type public.transaction_type not null,
  status public.transaction_status not null default 'pending',

  currency_code text not null default 'USD',
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  supplier_amount_cents integer not null default 0 check (supplier_amount_cents >= 0),
  broker_amount_cents integer not null default 0 check (broker_amount_cents >= 0),
  platform_amount_cents integer not null default 0 check (platform_amount_cents >= 0),

  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_transfer_group text,

  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transactions_split_sum_check
    check (supplier_amount_cents + broker_amount_cents + platform_amount_cents <= gross_amount_cents)
);

create index transactions_claim_idx on public.transactions (claim_id, occurred_at desc);
create index transactions_item_idx on public.transactions (item_id, occurred_at desc);
create index transactions_type_status_idx on public.transactions (transaction_type, status, occurred_at desc);
create unique index transactions_stripe_payment_intent_idx
  on public.transactions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- Lifecycle sync: claim state drives item digital + physical state ------------

create or replace function public.sync_item_status_from_claim()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('active', 'listing_generated') then
    update public.items
      set digital_status = 'claimed',
          physical_status = 'at_supplier_hub'
      where id = new.item_id;

  elsif new.status = 'listed_externally' then
    update public.items
      set digital_status = 'broker_listing_live',
          physical_status = 'at_supplier_hub'
      where id = new.item_id;

  elsif new.status = 'buyer_committed' then
    update public.items
      set digital_status = 'buyer_committed',
          physical_status = 'reserved_for_buyer_pickup'
      where id = new.item_id;

  elsif new.status = 'awaiting_pickup' then
    update public.items
      set digital_status = 'awaiting_hub_payment',
          physical_status = 'reserved_for_buyer_pickup'
      where id = new.item_id;

  elsif new.status = 'completed' then
    update public.items
      set digital_status = 'paid_at_hub',
          physical_status = 'released_to_buyer',
          sold_at = coalesce(sold_at, now())
      where id = new.item_id;

  elsif new.status in ('expired', 'cancelled') then
    update public.items
      set digital_status = case
        when new.status = 'expired' then 'claim_expired'::public.item_digital_status
        else 'ready_for_claim'::public.item_digital_status
      end,
      physical_status = 'at_supplier_hub'
      where id = new.item_id;
  end if;

  return new;
end;
$$;

create trigger claims_sync_item_status
after insert or update of status on public.claims
for each row execute function public.sync_item_status_from_claim();

-- Row-level security ----------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.hubs enable row level security;
alter table public.items enable row level security;
alter table public.claims enable row level security;
alter table public.transactions enable row level security;

-- Profiles
create policy "profiles_select_authenticated"
on public.profiles for select
using (auth.role() = 'authenticated');

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Hubs
create policy "hubs_select_authenticated"
on public.hubs for select
using (auth.role() = 'authenticated');

create policy "hubs_manage_by_supplier"
on public.hubs for all
using (auth.uid() = supplier_id)
with check (auth.uid() = supplier_id);

-- Items
create policy "items_select_market_or_owner"
on public.items for select
using (
  auth.uid() = supplier_id
  or digital_status in ('ready_for_claim', 'claimed', 'broker_listing_live', 'buyer_committed', 'awaiting_hub_payment')
);

create policy "items_manage_by_supplier"
on public.items for all
using (auth.uid() = supplier_id)
with check (auth.uid() = supplier_id);

-- Claims
create policy "claims_select_participants"
on public.claims for select
using (
  auth.uid() = broker_id
  or exists (
    select 1
    from public.items i
    where i.id = claims.item_id
      and i.supplier_id = auth.uid()
  )
);

create policy "claims_create_by_broker"
on public.claims for insert
with check (auth.uid() = broker_id);

create policy "claims_update_by_broker_or_supplier"
on public.claims for update
using (
  auth.uid() = broker_id
  or exists (
    select 1
    from public.items i
    where i.id = claims.item_id
      and i.supplier_id = auth.uid()
  )
)
with check (
  auth.uid() = broker_id
  or exists (
    select 1
    from public.items i
    where i.id = claims.item_id
      and i.supplier_id = auth.uid()
  )
);

-- Transactions
create policy "transactions_select_participants"
on public.transactions for select
using (auth.uid() = supplier_id or auth.uid() = broker_id);

create policy "transactions_insert_service_only"
on public.transactions for insert
with check (auth.role() = 'service_role');

create policy "transactions_update_service_only"
on public.transactions for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

-- Production hardening --------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_status'
      and e.enumlabel in ('pending_review', 'invited')
  ) then
    update public.profiles
    set status = 'active'
    where status::text in ('pending_review', 'invited');

    alter type public.user_status rename to user_status_legacy;
    create type public.user_status as enum ('active', 'suspended');

    alter table public.profiles
      alter column status drop default;

    alter table public.profiles
      alter column status type public.user_status
      using (
        case
          when status::text = 'suspended' then 'suspended'::public.user_status
          else 'active'::public.user_status
        end
      );

    drop type public.user_status_legacy;
  end if;
end $$;

alter table public.profiles
  alter column status set default 'active',
  alter column default_mode drop not null,
  alter column default_mode drop default,
  alter column can_supply set default false,
  alter column can_broker set default false;

update public.profiles
set default_mode = case
  when can_broker and not can_supply then 'broker'::public.user_default_mode
  when can_supply and not can_broker then 'supplier'::public.user_default_mode
  when can_broker and can_supply then coalesce(default_mode, 'broker'::public.user_default_mode)
  else null
end
where default_mode is distinct from case
  when can_broker and not can_supply then 'broker'::public.user_default_mode
  when can_supply and not can_broker then 'supplier'::public.user_default_mode
  when can_broker and can_supply then coalesce(default_mode, 'broker'::public.user_default_mode)
  else null
end;

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists country_code text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.profiles(id) on delete set null,
  add column if not exists stripe_connect_onboarding_complete boolean not null default false,
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists payout_currency_code text not null default 'USD';

update public.profiles
set country_code = coalesce(country_code, 'US'),
    payout_currency_code = coalesce(nullif(upper(payout_currency_code), ''), 'USD')
where country_code is null
   or payout_currency_code is null
   or payout_currency_code <> upper(payout_currency_code);

alter table public.profiles
  alter column country_code set default 'US';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_payout_currency_code_check'
  ) then
    alter table public.profiles
      add constraint profiles_payout_currency_code_check
      check (payout_currency_code in ('USD', 'CAD', 'GBP', 'EUR'));
  end if;
end $$;

alter table public.items
  add column if not exists currency_code text not null default 'USD';

alter table public.claims
  add column if not exists currency_code text not null default 'USD';

update public.items
set currency_code = coalesce(nullif(upper(currency_code), ''), 'USD')
where currency_code is null or currency_code <> upper(currency_code);

update public.claims
set currency_code = coalesce(nullif(upper(currency_code), ''), 'USD')
where currency_code is null or currency_code <> upper(currency_code);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'items_currency_code_check'
  ) then
    alter table public.items
      add constraint items_currency_code_check
      check (currency_code in ('USD', 'CAD', 'GBP', 'EUR'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'claims_currency_code_check'
  ) then
    alter table public.claims
      add constraint claims_currency_code_check
      check (currency_code in ('USD', 'CAD', 'GBP', 'EUR'));
  end if;
end $$;

create or replace function public.current_profile_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
  );
$$;

create or replace function public.current_profile_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.is_admin
  );
$$;

create or replace function public.current_user_has_claim_for_item(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.claims c
    where c.item_id = target_item_id
      and c.broker_id = auth.uid()
  );
$$;

create or replace function public.current_user_is_supplier_for_item(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.items i
    where i.id = target_item_id
      and i.supplier_id = auth.uid()
  );
$$;

create or replace function public.current_user_can_access_item_storage(target_item_id_text text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_item_id uuid;
begin
  if target_item_id_text is null
     or target_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  target_item_id := target_item_id_text::uuid;

  return public.current_user_is_supplier_for_item(target_item_id)
    or public.current_user_has_claim_for_item(target_item_id);
end;
$$;

create or replace function public.enforce_claim_currency_match()
returns trigger
language plpgsql
as $$
declare
  item_currency text;
begin
  select currency_code
  into item_currency
  from public.items
  where id = new.item_id;

  if item_currency is null then
    raise exception 'Unable to resolve item currency for claim.';
  end if;

  new.currency_code := coalesce(nullif(upper(new.currency_code), ''), item_currency);

  if new.currency_code <> item_currency then
    raise exception 'Claim currency must match item currency.';
  end if;

  return new;
end;
$$;

drop trigger if exists claims_enforce_currency on public.claims;
create trigger claims_enforce_currency
before insert or update on public.claims
for each row execute function public.enforce_claim_currency_match();

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  claim_id uuid references public.claims(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_correlation_idx
  on public.audit_events (correlation_id, created_at desc);
create index if not exists audit_events_type_idx
  on public.audit_events (event_type, created_at desc);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  correlation_id text not null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists webhook_events_provider_external_idx
  on public.webhook_events (provider, external_event_id);

create trigger webhook_events_set_updated_at
before update on public.webhook_events
for each row execute function public.set_updated_at();

create table if not exists public.mutation_requests (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  request_key text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  correlation_id text not null,
  status text not null default 'received',
  response_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mutation_requests_unique_idx
  on public.mutation_requests (operation, request_key, user_id);

create trigger mutation_requests_set_updated_at
before update on public.mutation_requests
for each row execute function public.set_updated_at();

alter table public.audit_events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.mutation_requests enable row level security;

drop policy if exists "audit_events_admin_or_actor" on public.audit_events;
create policy "audit_events_admin_or_actor"
on public.audit_events for select
using (
  public.current_profile_is_admin()
  or actor_profile_id = auth.uid()
  or target_profile_id = auth.uid()
);

drop policy if exists "audit_events_service_only" on public.audit_events;
create policy "audit_events_service_only"
on public.audit_events for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "webhook_events_service_only" on public.webhook_events;
create policy "webhook_events_service_only"
on public.webhook_events for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "mutation_requests_user_or_admin" on public.mutation_requests;
create policy "mutation_requests_user_or_admin"
on public.mutation_requests for select
using (public.current_profile_is_admin() or user_id = auth.uid());

drop policy if exists "mutation_requests_service_only" on public.mutation_requests;
create policy "mutation_requests_service_only"
on public.mutation_requests for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "hubs_select_authenticated" on public.hubs;
drop policy if exists "hubs_manage_by_supplier" on public.hubs;
drop policy if exists "items_select_market_or_owner" on public.items;
drop policy if exists "items_manage_by_supplier" on public.items;
drop policy if exists "claims_select_participants" on public.claims;
drop policy if exists "claims_create_by_broker" on public.claims;
drop policy if exists "claims_update_by_broker_or_supplier" on public.claims;
drop policy if exists "transactions_select_participants" on public.transactions;
drop policy if exists "transactions_insert_service_only" on public.transactions;
drop policy if exists "transactions_update_service_only" on public.transactions;

create policy "profiles_select_active_or_admin"
on public.profiles for select
using (
  auth.uid() = id
  or public.current_profile_is_admin()
  or (
    public.current_profile_is_active()
    and status = 'active'
  )
);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

create policy "profiles_admin_manage"
on public.profiles for all
using (public.current_profile_is_admin())
with check (public.current_profile_is_admin());

create policy "hubs_select_active_or_admin"
on public.hubs for select
using (public.current_profile_is_active() or public.current_profile_is_admin());

create policy "hubs_manage_by_supplier"
on public.hubs for all
using (
  auth.uid() = supplier_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.can_supply
  )
)
with check (
  auth.uid() = supplier_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.can_supply
  )
);

create policy "items_select_claimable_or_related"
on public.items for select
using (
  public.current_profile_is_admin()
  or auth.uid() = supplier_id
  or public.current_user_has_claim_for_item(items.id)
  or (
    public.current_profile_is_active()
    and digital_status = 'ready_for_claim'
    and archived_at is null
    and exists (
      select 1
      from public.profiles p
      where p.id = items.supplier_id
        and p.status = 'active'
    )
  )
);

create policy "items_manage_by_supplier"
on public.items for all
using (
  auth.uid() = supplier_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.can_supply
  )
)
with check (
  auth.uid() = supplier_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.can_supply
  )
);

create policy "claims_select_participants"
on public.claims for select
using (
  public.current_profile_is_admin()
  or auth.uid() = broker_id
  or public.current_user_is_supplier_for_item(claims.item_id)
);

create policy "claims_create_by_active_broker"
on public.claims for insert
with check (
  auth.uid() = broker_id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.can_broker
  )
);

create policy "claims_update_by_participants"
on public.claims for update
using (
  public.current_profile_is_admin()
  or auth.uid() = broker_id
  or public.current_user_is_supplier_for_item(claims.item_id)
)
with check (
  public.current_profile_is_admin()
  or auth.uid() = broker_id
  or public.current_user_is_supplier_for_item(claims.item_id)
);

create policy "transactions_select_participants"
on public.transactions for select
using (
  public.current_profile_is_admin()
  or auth.uid() = supplier_id
  or auth.uid() = broker_id
);

create policy "transactions_insert_service_only"
on public.transactions for insert
with check (auth.role() = 'service_role');

create policy "transactions_update_service_only"
on public.transactions for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'items',
  'items',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "items_bucket_select_related" on storage.objects;
drop policy if exists "items_bucket_insert_supplier" on storage.objects;
drop policy if exists "items_bucket_update_supplier" on storage.objects;
drop policy if exists "items_bucket_delete_supplier" on storage.objects;

create policy "items_bucket_select_related"
on storage.objects for select to authenticated
using (
  bucket_id = 'items'
  and (
    public.current_profile_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
    or public.current_user_can_access_item_storage((storage.foldername(name))[2])
  )
);

create policy "items_bucket_insert_supplier"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'items'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.can_supply
  )
);

create policy "items_bucket_update_supplier"
on storage.objects for update to authenticated
using (
  bucket_id = 'items'
  and (
    public.current_profile_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
)
with check (
  bucket_id = 'items'
  and (
    public.current_profile_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy "items_bucket_delete_supplier"
on storage.objects for delete to authenticated
using (
  bucket_id = 'items'
  and (
    public.current_profile_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);
