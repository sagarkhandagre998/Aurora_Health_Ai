-- Fix: "Database error saving new user" on signup.
--
-- Root cause: handle_new_user() is SECURITY DEFINER but had no explicit
-- search_path and referenced "profiles" unqualified. When the trigger fires
-- during the auth.users insert, the unqualified name fails to resolve, the
-- INSERT throws, and Supabase Auth surfaces it as "Database error saving new
-- user". Fix = pin search_path and fully-qualify public.profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Recreate the trigger to be safe (idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
