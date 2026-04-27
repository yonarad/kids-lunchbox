CREATE TABLE public.parent_picks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  selection_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Jerusalem'::text))::date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (child_id, selection_date)
);

ALTER TABLE public.parent_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ParentPicks: members read"
ON public.parent_picks FOR SELECT
USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "ParentPicks: members write"
ON public.parent_picks FOR ALL
USING (public.is_household_member(household_id, auth.uid()))
WITH CHECK (public.is_household_member(household_id, auth.uid()));