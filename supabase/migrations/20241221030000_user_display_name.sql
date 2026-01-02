-- Add display_name to user_preferences
alter table public.user_preferences
  add column if not exists display_name text;
