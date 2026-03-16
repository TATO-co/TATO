alter type public.transaction_type add value if not exists 'claim_deposit';

alter table public.claims
  add column if not exists claim_deposit_cents integer check (claim_deposit_cents >= 0),
  add column if not exists locked_floor_price_cents integer check (locked_floor_price_cents >= 0),
  add column if not exists locked_suggested_list_price_cents integer check (locked_suggested_list_price_cents >= 0),
  add column if not exists supplier_upside_bps integer check (supplier_upside_bps >= 0),
  add column if not exists broker_upside_bps integer check (broker_upside_bps >= 0),
  add column if not exists platform_upside_bps integer check (platform_upside_bps >= 0),
  add column if not exists economics_version text,
  add column if not exists claim_deposit_captured_at timestamptz,
  add column if not exists claim_deposit_refunded_at timestamptz;
