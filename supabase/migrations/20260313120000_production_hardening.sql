do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_status'
      and e.enumlabel = 'invited'
  ) then
    alter type public.user_status rename value 'invited' to 'pending_review';
  end if;
end $$;

alter table public.profiles
  alter column status set default 'pending_review';

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
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.is_admin
  );
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
  or exists (
    select 1
    from public.claims c
    where c.item_id = items.id
      and c.broker_id = auth.uid()
  )
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
  or exists (
    select 1
    from public.items i
    where i.id = claims.item_id
      and i.supplier_id = auth.uid()
  )
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
  or exists (
    select 1
    from public.items i
    where i.id = claims.item_id
      and i.supplier_id = auth.uid()
  )
)
with check (
  public.current_profile_is_admin()
  or auth.uid() = broker_id
  or exists (
    select 1
    from public.items i
    where i.id = claims.item_id
      and i.supplier_id = auth.uid()
  )
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
    or exists (
      select 1
      from public.items i
      where i.id::text = (storage.foldername(name))[2]
        and (
          i.supplier_id = auth.uid()
          or exists (
            select 1
            from public.claims c
            where c.item_id = i.id
              and c.broker_id = auth.uid()
          )
        )
    )
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
