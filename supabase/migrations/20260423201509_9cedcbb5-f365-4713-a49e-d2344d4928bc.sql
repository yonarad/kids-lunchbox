
insert into storage.buckets (id, name, public) values ('food-images', 'food-images', true)
on conflict (id) do nothing;

create policy "Food images: public read"
on storage.objects for select
using (bucket_id = 'food-images');

create policy "Food images: auth upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'food-images'
  and public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);

create policy "Food images: auth update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'food-images'
  and public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);

create policy "Food images: auth delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'food-images'
  and public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);
