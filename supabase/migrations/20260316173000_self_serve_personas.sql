update public.profiles
set status = 'active'
where status::text in ('pending_review', 'invited');

-- Keep any legacy enum labels in place for now. Removing them safely requires
-- dropping and recreating a broad set of RLS policies that reference
-- public.profiles.status. The application no longer uses pending_review, and
-- the functional fix for self-serve onboarding is to normalize existing rows
-- and relax the profile bootstrap columns below.

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
