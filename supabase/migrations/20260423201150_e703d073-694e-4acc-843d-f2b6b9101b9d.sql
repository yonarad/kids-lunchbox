
-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Households
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'הבית שלי',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.households enable row level security;

-- Household members (sharing)
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null default 'parent',
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);
alter table public.household_members enable row level security;

-- Helper function: is the current user a member of a household?
create or replace function public.is_household_member(_household_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.households h where h.id = _household_id and h.owner_id = _user_id
  ) or exists (
    select 1 from public.household_members m where m.household_id = _household_id and m.user_id = _user_id
  );
$$;

-- Children
create table public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  avatar_color text not null default '#FFB6C1',
  avatar_emoji text not null default '🙂',
  created_at timestamptz not null default now()
);
alter table public.children enable row level security;

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  emoji text not null default '🍽️',
  color text not null default '#FFD93D',
  max_selections int not null default 1,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;

-- Food items
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  image_url text,
  emoji text default '🍎',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.food_items enable row level security;

-- Selections (history of choices)
create table public.selections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  food_item_id uuid not null references public.food_items(id) on delete cascade,
  selection_date date not null default (now() at time zone 'Asia/Jerusalem')::date,
  created_at timestamptz not null default now()
);
alter table public.selections enable row level security;
create index selections_household_date_idx on public.selections(household_id, selection_date);

-- Household settings
create table public.household_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  reminder_hour int not null default 20,
  email_notifications boolean not null default true,
  morning_email_hour int not null default 5,
  reset_hour int not null default 12
);
alter table public.household_settings enable row level security;

-- RLS Policies
create policy "Profiles: self read" on public.profiles for select using (auth.uid() = id);
create policy "Profiles: self update" on public.profiles for update using (auth.uid() = id);
create policy "Profiles: self insert" on public.profiles for insert with check (auth.uid() = id);

create policy "Households: members read" on public.households for select using (public.is_household_member(id, auth.uid()));
create policy "Households: owner update" on public.households for update using (owner_id = auth.uid());
create policy "Households: owner insert" on public.households for insert with check (owner_id = auth.uid());
create policy "Households: owner delete" on public.households for delete using (owner_id = auth.uid());

create policy "Members: members read" on public.household_members for select using (public.is_household_member(household_id, auth.uid()));
create policy "Members: owner manage" on public.household_members for all using (
  exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid())
);

create policy "Children: members read" on public.children for select using (public.is_household_member(household_id, auth.uid()));
create policy "Children: members write" on public.children for all using (public.is_household_member(household_id, auth.uid())) with check (public.is_household_member(household_id, auth.uid()));

create policy "Categories: members read" on public.categories for select using (public.is_household_member(household_id, auth.uid()));
create policy "Categories: members write" on public.categories for all using (public.is_household_member(household_id, auth.uid())) with check (public.is_household_member(household_id, auth.uid()));

create policy "Food: members read" on public.food_items for select using (public.is_household_member(household_id, auth.uid()));
create policy "Food: members write" on public.food_items for all using (public.is_household_member(household_id, auth.uid())) with check (public.is_household_member(household_id, auth.uid()));

create policy "Selections: members read" on public.selections for select using (public.is_household_member(household_id, auth.uid()));
create policy "Selections: members write" on public.selections for all using (public.is_household_member(household_id, auth.uid())) with check (public.is_household_member(household_id, auth.uid()));

create policy "Settings: members read" on public.household_settings for select using (public.is_household_member(household_id, auth.uid()));
create policy "Settings: members write" on public.household_settings for all using (public.is_household_member(household_id, auth.uid())) with check (public.is_household_member(household_id, auth.uid()));

-- Auto-create profile, household, default categories on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));

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

  -- Auto-link to households the user was invited to via email
  update public.household_members
  set user_id = new.id
  where invited_email = new.email and user_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
