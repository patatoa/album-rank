-- User preferences for per-user feature flags (intro bubble dismissal)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  intro_dismissed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Read own preferences" on public.user_preferences;
create policy "Read own preferences"
on public.user_preferences
for select
using (auth.uid() = user_id);

drop policy if exists "Insert own preferences" on public.user_preferences;
create policy "Insert own preferences"
on public.user_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists "Update own preferences" on public.user_preferences;
create policy "Update own preferences"
on public.user_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
