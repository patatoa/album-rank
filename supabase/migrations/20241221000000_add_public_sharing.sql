-- Add public sharing columns and index for ranking lists
alter table public.ranking_lists
  add column if not exists public_slug text,
  add column if not exists is_public boolean default false;

create unique index if not exists ranking_lists_public_slug_unique
on public.ranking_lists (public_slug)
where public_slug is not null;
