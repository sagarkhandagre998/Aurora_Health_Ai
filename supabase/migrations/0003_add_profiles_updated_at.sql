-- Fix: onboarding "Finish setup" (notifications step) updates profiles with an
-- updated_at field, but the profiles table never defined that column.
-- Add it, default it to now(), and keep it fresh on every update via a trigger.

alter table public.profiles
  add column if not exists updated_at timestamptz default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
