-- Enable RLS
alter table public.albums enable row level security;
alter table public.user_albums enable row level security;
alter table public.ranking_lists enable row level security;
alter table public.ranking_items enable row level security;
alter table public.comparisons enable row level security;
alter table public.elo_ratings enable row level security;

-- Albums: allow authenticated read
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'albums' and policyname = 'Authenticated read albums'
  ) then
    create policy "Authenticated read albums" on public.albums
      for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- user_albums: owner only
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_albums' and policyname = 'Owner read user_albums'
  ) then
    create policy "Owner read user_albums" on public.user_albums
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_albums' and policyname = 'Owner write user_albums'
  ) then
    create policy "Owner write user_albums" on public.user_albums
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_albums' and policyname = 'Owner update user_albums'
  ) then
    create policy "Owner update user_albums" on public.user_albums
      for update using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_albums' and policyname = 'Owner delete user_albums'
  ) then
    create policy "Owner delete user_albums" on public.user_albums
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ranking_lists: owner only
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_lists' and policyname = 'Owner read ranking_lists'
  ) then
    create policy "Owner read ranking_lists" on public.ranking_lists
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_lists' and policyname = 'Owner write ranking_lists'
  ) then
    create policy "Owner write ranking_lists" on public.ranking_lists
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_lists' and policyname = 'Owner update ranking_lists'
  ) then
    create policy "Owner update ranking_lists" on public.ranking_lists
      for update using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_lists' and policyname = 'Owner delete ranking_lists'
  ) then
    create policy "Owner delete ranking_lists" on public.ranking_lists
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ranking_items: only if list belongs to user
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_items' and policyname = 'Owner read ranking_items'
  ) then
    create policy "Owner read ranking_items" on public.ranking_items
      for select using (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_items' and policyname = 'Owner write ranking_items'
  ) then
    create policy "Owner write ranking_items" on public.ranking_items
      for insert with check (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_items' and policyname = 'Owner update ranking_items'
  ) then
    create policy "Owner update ranking_items" on public.ranking_items
      for update using (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'ranking_items' and policyname = 'Owner delete ranking_items'
  ) then
    create policy "Owner delete ranking_items" on public.ranking_items
      for delete using (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
end $$;

-- comparisons: only if list belongs to user
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'comparisons' and policyname = 'Owner read comparisons'
  ) then
    create policy "Owner read comparisons" on public.comparisons
      for select using (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'comparisons' and policyname = 'Owner write comparisons'
  ) then
    create policy "Owner write comparisons" on public.comparisons
      for insert with check (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
end $$;

-- elo_ratings: only if list belongs to user
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elo_ratings' and policyname = 'Owner read elo_ratings'
  ) then
    create policy "Owner read elo_ratings" on public.elo_ratings
      for select using (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elo_ratings' and policyname = 'Owner write elo_ratings'
  ) then
    create policy "Owner write elo_ratings" on public.elo_ratings
      for insert with check (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elo_ratings' and policyname = 'Owner update elo_ratings'
  ) then
    create policy "Owner update elo_ratings" on public.elo_ratings
      for update using (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'elo_ratings' and policyname = 'Owner delete elo_ratings'
  ) then
    create policy "Owner delete elo_ratings" on public.elo_ratings
      for delete using (exists (select 1 from public.ranking_lists rl where rl.id = ranking_list_id and rl.user_id = auth.uid()));
  end if;
end $$;
