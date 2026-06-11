create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text, age int, gender text,
  height_cm numeric, weight_kg numeric,
  wake_time time, bedtime time, activity_level text,
  goals text[] default '{}',
  notification_prefs jsonb default '{"hydration":true,"sleep":true,"habits":true,"insights":true}',
  onboarding_complete boolean default false,
  created_at timestamptz default now()
);
create table water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  amount_ml int not null, logged_at timestamptz default now()
);
create table sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null, sleep_start timestamptz, sleep_end timestamptz,
  duration_min int, quality int, unique (user_id, date)
);
create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null, icon text, frequency text default 'daily',
  target_per_day int default 1, status text default 'active',
  created_at timestamptz default now()
);
create table habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  habit_id uuid not null references habits on delete cascade,
  date date not null, count int default 1, unique (habit_id, date)
);
create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text, meal_type text,
  calories int, protein_g numeric, carbs_g numeric, fat_g numeric,
  logged_at timestamptz default now()
);
create table streaks (
  user_id uuid not null references auth.users on delete cascade,
  type text not null, current int default 0, longest int default 0,
  last_date date, primary key (user_id, type)
);
create table health_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  observation text not null, created_at timestamptz default now()
);
create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null, category text, created_at timestamptz default now()
);

-- RLS policies
alter table water_logs enable row level security;
create policy "own" on water_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table sleep_logs enable row level security;
create policy "own" on sleep_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table habits enable row level security;
create policy "own" on habits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table habit_completions enable row level security;
create policy "own" on habit_completions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table meals enable row level security;
create policy "own" on meals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table streaks enable row level security;
create policy "own" on streaks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table health_memory enable row level security;
create policy "own" on health_memory for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table insights enable row level security;
create policy "own" on insights for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table profiles enable row level security;
create policy "own" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
