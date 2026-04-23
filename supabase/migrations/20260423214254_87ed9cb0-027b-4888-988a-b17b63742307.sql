-- Junction table for many-to-many between food_items and categories
CREATE TABLE public.food_item_categories (
  food_item_id uuid NOT NULL REFERENCES public.food_items(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  household_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (food_item_id, category_id)
);

CREATE INDEX idx_fic_category ON public.food_item_categories(category_id);
CREATE INDEX idx_fic_household ON public.food_item_categories(household_id);

ALTER TABLE public.food_item_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FIC: members read"
  ON public.food_item_categories
  FOR SELECT
  USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "FIC: members write"
  ON public.food_item_categories
  FOR ALL
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

-- Backfill existing primary category links
INSERT INTO public.food_item_categories (food_item_id, category_id, household_id)
SELECT id, category_id, household_id FROM public.food_items
ON CONFLICT DO NOTHING;