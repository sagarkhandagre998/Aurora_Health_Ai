-- Aurora Nutri-Coach: AI-generated single-meal preparations / recipes.
-- Mirrors the "own" RLS pattern used by every other table in 0001_init.sql.

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  meal_type text,                       -- breakfast | lunch | dinner | snack
  diet_type text,                       -- veg | nonveg | vegan
  description text,                     -- one-line summary of the dish
  calories int,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  ingredients jsonb default '[]',       -- string[]: ["200g paneer", "1 cup spinach", ...]
  steps jsonb default '[]',             -- string[]: ordered prep instructions
  logged boolean default false,         -- true once the user logs it as eaten
  created_at timestamptz default now()
);

create index meal_plans_user_created_idx on meal_plans (user_id, created_at desc);

alter table meal_plans enable row level security;
create policy "own" on meal_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
