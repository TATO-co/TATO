alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_default_payment_method_id text,
  add column if not exists stripe_default_payment_method_brand text,
  add column if not exists stripe_default_payment_method_last4 text;

alter table public.claims
  add column if not exists buyer_payment_amount_cents integer check (buyer_payment_amount_cents >= 0),
  add column if not exists buyer_payment_token text,
  add column if not exists buyer_payment_status text not null default 'not_started',
  add column if not exists buyer_payment_checkout_session_id text,
  add column if not exists buyer_payment_link_created_at timestamptz,
  add column if not exists buyer_payment_paid_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'claims_buyer_payment_status_check'
  ) then
    alter table public.claims
      add constraint claims_buyer_payment_status_check
      check (buyer_payment_status in ('not_started', 'link_ready', 'checkout_open', 'paid', 'expired'));
  end if;
end $$;

update public.claims
set buyer_payment_amount_cents = coalesce(buyer_payment_amount_cents, locked_suggested_list_price_cents),
    buyer_payment_status = case
      when buyer_payment_paid_at is not null or status = 'completed' then 'paid'
      when status in ('buyer_committed', 'awaiting_pickup') then 'link_ready'
      else 'not_started'
    end
where buyer_payment_amount_cents is null
   or buyer_payment_status is null
   or buyer_payment_status = 'not_started';

create unique index if not exists claims_buyer_payment_token_idx
  on public.claims (buyer_payment_token)
  where buyer_payment_token is not null;

create index if not exists claims_buyer_payment_status_idx
  on public.claims (buyer_payment_status, created_at desc);

alter table public.transactions
  add column if not exists stripe_mode text not null default 'test';

alter table public.webhook_events
  add column if not exists stripe_mode text not null default 'test';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_stripe_mode_check'
  ) then
    alter table public.transactions
      add constraint transactions_stripe_mode_check
      check (stripe_mode in ('test', 'live'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'webhook_events_stripe_mode_check'
  ) then
    alter table public.webhook_events
      add constraint webhook_events_stripe_mode_check
      check (stripe_mode in ('test', 'live'));
  end if;
end $$;

update public.transactions
set stripe_mode = coalesce(nullif(lower(stripe_mode), ''), 'test')
where stripe_mode is null or stripe_mode not in ('test', 'live');

update public.webhook_events
set stripe_mode = coalesce(nullif(lower(stripe_mode), ''), 'test')
where stripe_mode is null or stripe_mode not in ('test', 'live');
