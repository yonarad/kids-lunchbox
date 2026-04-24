
-- Add email and user_id columns to children
ALTER TABLE public.children
  ADD COLUMN email text UNIQUE,
  ADD COLUMN user_id uuid UNIQUE;

-- Update handle_new_user to also link children by email
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

  -- Link child record if email matches
  update public.children
  set user_id = new.id
  where email = new.email and user_id is null;

  -- Check if the user is already a member of an existing household (via invite)
  select count(*) into existing_invite_count
  from public.household_members
  where user_id = new.id;

  -- Also count if user is linked as a child in any household
  if existing_invite_count = 0 then
    select count(*) into existing_invite_count
    from public.children
    where user_id = new.id;
  end if;

  -- Only create a new household if the user has no existing memberships or child links
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

-- Allow children with user_id to read their own household's data
-- (they need to see categories, food_items, selections for their household)
-- We add a helper function to check if a user is a child in a household
CREATE OR REPLACE FUNCTION public.is_household_child(_household_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.children c
    where c.household_id = _household_id
      and c.user_id = _user_id
  );
$function$;

-- Update is_household_member to also include children
CREATE OR REPLACE FUNCTION public.is_household_member(_household_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.households h where h.id = _household_id and h.owner_id = _user_id
  ) or exists (
    select 1 from public.household_members m where m.household_id = _household_id and m.user_id = _user_id
  ) or exists (
    select 1 from public.children c where c.household_id = _household_id and c.user_id = _user_id
  );
$function$;
