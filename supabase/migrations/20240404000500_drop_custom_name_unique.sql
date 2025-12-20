-- Drop optional unique index on (user_id, name) to allow upsert on custom lists without conflict clause
drop index if exists ranking_lists_user_name_unique;
