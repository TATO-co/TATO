alter table public.profiles
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_requirements_currently_due text[] not null default '{}',
  add column if not exists stripe_connect_requirements_past_due text[] not null default '{}',
  add column if not exists stripe_connect_requirements_pending_verification text[] not null default '{}',
  add column if not exists stripe_connect_disabled_reason text,
  add column if not exists stripe_connect_restricted_soon boolean not null default false;

alter table public.transactions
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_refund_id text;

create index if not exists profiles_stripe_connected_account_idx
  on public.profiles (stripe_connected_account_id)
  where stripe_connected_account_id is not null;

create index if not exists transactions_stripe_transfer_idx
  on public.transactions (stripe_transfer_id)
  where stripe_transfer_id is not null;
