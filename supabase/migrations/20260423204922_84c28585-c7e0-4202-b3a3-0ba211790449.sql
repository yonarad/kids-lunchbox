CREATE POLICY "Profiles: household members read"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.households h
    WHERE h.owner_id = profiles.id
      AND public.is_household_member(h.id, auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.household_members m1
    JOIN public.household_members m2 ON m1.household_id = m2.household_id
    WHERE m1.user_id = profiles.id
      AND m2.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.household_members m
    JOIN public.households h ON h.id = m.household_id
    WHERE m.user_id = profiles.id
      AND h.owner_id = auth.uid()
  )
);