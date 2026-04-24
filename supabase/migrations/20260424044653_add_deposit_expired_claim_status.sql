alter type public.claim_status add value if not exists 'deposit_expired' after 'expired';

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

  elsif new.status in ('expired', 'deposit_expired', 'cancelled') then
    update public.items
      set digital_status = case
        when new.status in ('expired', 'deposit_expired') then 'claim_expired'::public.item_digital_status
        else 'ready_for_claim'::public.item_digital_status
      end,
      physical_status = 'at_supplier_hub'
      where id = new.item_id;
  end if;

  return new;
end;
$$;
