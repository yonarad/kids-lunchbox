
DELETE FROM public.selections a USING public.selections b
WHERE a.ctid < b.ctid
  AND a.child_id = b.child_id
  AND a.food_item_id = b.food_item_id
  AND a.selection_date = b.selection_date;

ALTER TABLE public.selections
  ADD CONSTRAINT selections_unique_child_item_date
  UNIQUE (child_id, food_item_id, selection_date);
