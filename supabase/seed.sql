-- Seed data for local testing
-- Creates a sample year ranking and inserts two albums and items for the current user if not present.

-- NOTE: Replace this UUID with your local user ID after signing in and running:
-- select id from auth.users limit 1;
-- Or set via env and sed before running supabase db reset.
-- \echo 'Update user_id below before using seed.sql for local data.'

-- sample user id placeholder
-- select '00000000-0000-0000-0000-000000000000' as user_id \gset
-- Uncomment and set the correct user_id above, then uncomment the statements below.

-- DO $$ BEGIN
--   IF (select count(*) from public.ranking_lists where user_id = :'user_id' and kind = 'year' and year = extract(year from now())::int) = 0 THEN
--     insert into public.ranking_lists (user_id, kind, year, name) values (:'user_id', 'year', extract(year from now())::int, extract(year from now())::text);
--   END IF;
-- END $$;

-- DO $$ BEGIN
--   -- sample albums
--   insert into public.albums (provider, title, artist, release_year)
--   values ('manual', 'Sample Album A', 'Sample Artist', extract(year from now())::int),
--          ('manual', 'Sample Album B', 'Sample Artist', extract(year from now())::int)
--   on conflict do nothing;

--   -- link to user albums
--   insert into public.user_albums (user_id, album_id)
--   select :'user_id', id from public.albums
--   on conflict do nothing;

--   -- add to year ranking
--   insert into public.ranking_items (ranking_list_id, album_id, position)
--   select rl.id, a.id, row_number() over ()
--   from public.ranking_lists rl
--   cross join lateral (select id from public.albums order by title limit 2) as a
--   where rl.user_id = :'user_id' and rl.kind = 'year' and rl.year = extract(year from now())::int
--   on conflict do nothing;
-- END $$;
