-- Add mode and description to ranking_lists
alter table public.ranking_lists
  add column if not exists mode text not null default 'ranked' check (mode in ('ranked','collection'));

alter table public.ranking_lists
  add column if not exists description text null;

-- ranking_items position nullable for collections
alter table public.ranking_items
  alter column position drop not null;

-- replace unique index with partial unique (only when position is not null)
drop index if exists ranking_items_position_unique;
create unique index if not exists ranking_items_position_unique
on public.ranking_items (ranking_list_id, position)
where position is not null;
