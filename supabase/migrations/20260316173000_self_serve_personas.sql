update public.profiles
set status = 'active'
where status::text in ('pending_review', 'invited');

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_status'
      and e.enumlabel in ('pending_review', 'invited')
  ) then
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
