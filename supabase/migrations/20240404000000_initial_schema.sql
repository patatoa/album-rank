-- AlbumRanker schema (v1)

-- Extensions
create extension if not exists "uuid-ossp";

-- albums
create table if not exists public.albums (
  id uuid primary key default uuid_generate_v4(),
  provider text not null check (provider in ('itunes', 'manual')),
  provider_album_id text null,
  created_by_user_id uuid null,
  title text not null,
  artist text not null,
  release_year int null,
  itunes_url text null,
  artwork_thumb_path text null,
  artwork_medium_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique for iTunes albums
create unique index if not exists albums_itunes_unique
on public.albums (provider, provider_album_id)
where provider = 'itunes';

-- user_albums
create table if not exists public.user_albums (
  user_id uuid not null,
  album_id uuid not null references public.albums(id) on delete cascade,
  status text not null default 'not_listened' check (status in ('not_listened','listening','listened')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, album_id)
);

-- ranking_lists
create table if not exists public.ranking_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  name text not null,
  kind text not null default 'custom' check (kind in ('year','custom')),
  year int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ranking_lists_year_unique
on public.ranking_lists (user_id, kind, year)
where kind = 'year';

-- ranking_items
create table if not exists public.ranking_items (
  ranking_list_id uuid not null references public.ranking_lists(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  position int not null check (position >= 1),
  added_at timestamptz not null default now(),
  primary key (ranking_list_id, album_id)
);

create unique index if not exists ranking_items_position_unique
on public.ranking_items (ranking_list_id, position);

-- comparisons
create table if not exists public.comparisons (
  id uuid primary key default uuid_generate_v4(),
  ranking_list_id uuid not null references public.ranking_lists(id) on delete cascade,
  left_album_id uuid not null references public.albums(id) on delete cascade,
  right_album_id uuid not null references public.albums(id) on delete cascade,
  winner_album_id uuid not null references public.albums(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- elo_ratings
create table if not exists public.elo_ratings (
  ranking_list_id uuid not null references public.ranking_lists(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  rating double precision not null default 1500,
  matches int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (ranking_list_id, album_id)
);

-- updated_at triggers (optional; implement in app if you prefer)
-- For simplicity in v1, updated_at can be updated by app code.
