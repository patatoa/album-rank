-- Create public bucket for album art
insert into storage.buckets (id, name, public)
values ('album-art', 'album-art', true)
on conflict (id) do nothing;

-- Allow public read access to album-art objects
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public read album-art'
  ) then
    create policy "Public read album-art"
    on storage.objects
    for select
    using (bucket_id = 'album-art');
  end if;
end $$;
