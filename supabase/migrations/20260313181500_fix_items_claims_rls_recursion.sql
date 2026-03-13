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

drop policy if exists "items_select_claimable_or_related" on public.items;
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

drop policy if exists "claims_select_participants" on public.claims;
create policy "claims_select_participants"
on public.claims for select
using (
  public.current_profile_is_admin()
  or auth.uid() = broker_id
  or public.current_user_is_supplier_for_item(claims.item_id)
);

drop policy if exists "claims_update_by_participants" on public.claims;
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

drop policy if exists "items_bucket_select_related" on storage.objects;
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
