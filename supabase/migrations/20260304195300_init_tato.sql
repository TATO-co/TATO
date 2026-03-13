-- TATO foundational schema
-- Covers users, physical hubs, inventory items, broker claims, and money movement.

create extension if not exists pgcrypto;

-- Enums -----------------------------------------------------------------------

create type public.user_default_mode as enum ('supplier', 'broker');
create type public.user_status as enum ('active', 'suspended', 'invited');

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
  default_mode public.user_default_mode not null default 'broker',
  status public.user_status not null default 'active',
  can_supply boolean not null default true,
  can_broker boolean not null default true,
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
