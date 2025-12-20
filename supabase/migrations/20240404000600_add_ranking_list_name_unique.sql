-- Ensure unique index exists for (user_id, name) to support upsert on custom ranking lists
create unique index if not exists ranking_lists_user_name_unique
on public.ranking_lists (user_id, name);
