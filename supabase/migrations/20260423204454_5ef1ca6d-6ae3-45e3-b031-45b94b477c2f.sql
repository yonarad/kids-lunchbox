-- Update handle_new_user: skip creating a new household if user was already invited
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_household_id uuid;
  existing_invite_count int;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  -- Link any pending invitations to this new user
  update public.household_members
  set user_id = new.id
  where invited_email = new.email and user_id is null;

  -- Check if the user is already a member of an existing household (via invite)
  select count(*) into existing_invite_count
  from public.household_members
  where user_id = new.id;

  -- Only create a new household if the user has no existing memberships
  if existing_invite_count = 0 then
    insert into public.households (owner_id, name)
    values (new.id, 'הבית שלי')
    returning id into new_household_id;

    insert into public.household_settings (household_id) values (new_household_id);

    insert into public.categories (household_id, name, emoji, color, max_selections, sort_order) values
      (new_household_id, 'כריך', '🥪', '#FFB347', 1, 1),
      (new_household_id, 'ירק', '🥕', '#90EE90', 2, 2),
      (new_household_id, 'פרי', '🍎', '#FF6B6B', 2, 3),
      (new_household_id, 'חטיף', '🍪', '#FFD93D', 1, 4),
      (new_household_id, 'שתייה', '🧃', '#87CEEB', 1, 5);
  end if;

  return new;
end;
$function$;

-- Clean up the orphan empty household created for diarad@gmail.com
DELETE FROM public.households
WHERE id = '3e9902b7-6c8e-43b9-82a1-36f3dfea3d39'
  AND NOT EXISTS (SELECT 1 FROM public.children WHERE household_id = '3e9902b7-6c8e-43b9-82a1-36f3dfea3d39')
  AND NOT EXISTS (SELECT 1 FROM public.food_items WHERE household_id = '3e9902b7-6c8e-43b9-82a1-36f3dfea3d39');