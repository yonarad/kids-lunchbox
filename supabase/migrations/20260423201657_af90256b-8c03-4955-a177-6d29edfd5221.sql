
drop policy if exists "Food images: public read" on storage.objects;

-- Allow public to read individual files via URL but block listing all files
-- Public reads via getPublicUrl don't actually use SELECT on storage.objects
-- (they hit the storage CDN directly), so we restrict SELECT to household members only
create policy "Food images: members list"
on storage.objects for select
to authenticated
using (
  bucket_id = 'food-images'
  and public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);
