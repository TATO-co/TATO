drop policy if exists "claims_create_by_broker" on public.claims;
drop policy if exists "claims_create_by_active_broker" on public.claims;
drop policy if exists "claims_update_by_participants" on public.claims;
drop policy if exists "claims_update_service_only" on public.claims;

create policy "claims_insert_service_only"
on public.claims for insert
with check (auth.role() = 'service_role');

create policy "claims_update_service_only"
on public.claims for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create unique index if not exists transactions_one_pending_buyer_checkout_idx
  on public.transactions (claim_id)
  where transaction_type = 'sale_payment'
    and status = 'pending'
    and metadata ->> 'checkout_kind' = 'buyer_payment';
