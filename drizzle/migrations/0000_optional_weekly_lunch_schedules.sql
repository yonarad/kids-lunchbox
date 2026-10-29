CREATE FUNCTION public.is_household_parent(_household_id uuid, _user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.households WHERE id=_household_id AND owner_id=_user_id) OR EXISTS (SELECT 1 FROM public.household_members WHERE household_id=_household_id AND user_id=_user_id AND role='parent'); $$;
REVOKE ALL ON FUNCTION public.is_household_parent(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_household_parent(uuid,uuid) TO authenticated, service_role;
CREATE TABLE public.child_weekly_schedules (child_id uuid PRIMARY KEY REFERENCES public.children(id) ON DELETE CASCADE, household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT false);
GRANT SELECT ON public.child_weekly_schedules TO authenticated;
GRANT ALL ON public.child_weekly_schedules TO service_role;
ALTER TABLE public.child_weekly_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents read schedules" ON public.child_weekly_schedules FOR SELECT TO authenticated USING (public.is_household_parent(household_id,auth.uid()));
CREATE TABLE public.weekly_schedule_items (child_id uuid NOT NULL REFERENCES public.child_weekly_schedules(child_id) ON DELETE CASCADE, weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), food_item_id uuid NOT NULL REFERENCES public.food_items(id) ON DELETE CASCADE, household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0, PRIMARY KEY(child_id,weekday,food_item_id));
GRANT SELECT ON public.weekly_schedule_items TO authenticated;
GRANT ALL ON public.weekly_schedule_items TO service_role;
ALTER TABLE public.weekly_schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents read schedule items" ON public.weekly_schedule_items FOR SELECT TO authenticated USING (public.is_household_parent(household_id,auth.uid()));
CREATE TABLE public.weekly_schedule_applications (child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE, selection_date date NOT NULL, household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE, PRIMARY KEY(child_id,selection_date));
GRANT SELECT ON public.weekly_schedule_applications TO authenticated;
GRANT ALL ON public.weekly_schedule_applications TO service_role;
ALTER TABLE public.weekly_schedule_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read applications" ON public.weekly_schedule_applications FOR SELECT TO authenticated USING (public.is_household_member(household_id,auth.uid()));
CREATE FUNCTION public.save_weekly_schedule(_child_id uuid, _enabled boolean, _items jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h uuid;
BEGIN
 SELECT household_id INTO h FROM public.children WHERE id=_child_id;
 IF h IS NULL OR NOT public.is_household_parent(h,auth.uid()) THEN RAISE EXCEPTION 'Only household parents can manage schedules'; END IF;
 IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items)>350 THEN RAISE EXCEPTION 'Invalid schedule'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_to_recordset(_items) AS x(weekday integer,food_item_id uuid) LEFT JOIN public.food_items f ON f.id=x.food_item_id AND f.household_id=h WHERE f.id IS NULL OR x.weekday IS NULL OR x.weekday NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION 'Invalid food or weekday'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_child_id::text,0));
 INSERT INTO public.child_weekly_schedules(child_id,household_id,enabled) VALUES(_child_id,h,_enabled) ON CONFLICT(child_id) DO UPDATE SET enabled=excluded.enabled;
 DELETE FROM public.weekly_schedule_items WHERE child_id=_child_id;
 INSERT INTO public.weekly_schedule_items(child_id,household_id,weekday,food_item_id,sort_order) SELECT _child_id,h,(e.value->>'weekday')::smallint,(e.value->>'food_item_id')::uuid,e.ordinality::integer FROM jsonb_array_elements(_items) WITH ORDINALITY e(value,ordinality) ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.save_weekly_schedule(uuid,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_weekly_schedule(uuid,boolean,jsonb) TO authenticated;
CREATE FUNCTION public.fill_weekly_schedules(_household_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; f record; target date; dow integer; inserted integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
   IF _household_id IS NULL OR NOT public.is_household_member(_household_id,auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 END IF;
 -- SECURITY DEFINER current_user is postgres: independently enforce JWT callers.
 IF auth.uid() IS NOT NULL AND (_household_id IS NULL OR NOT public.is_household_member(_household_id,auth.uid())) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 IF auth.uid() IS NULL AND session_user NOT IN ('postgres','supabase_admin') AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 FOR c IN SELECT s.child_id,s.household_id,coalesce(hs.reset_hour,12) AS reset_hour FROM public.child_weekly_schedules s LEFT JOIN public.household_settings hs ON hs.household_id=s.household_id WHERE s.enabled AND (_household_id IS NULL OR s.household_id=_household_id) AND (auth.uid() IS NULL OR public.is_household_parent(s.household_id,auth.uid()) OR EXISTS(SELECT 1 FROM public.children k WHERE k.id=s.child_id AND k.user_id=auth.uid())) LOOP
   target := (now() AT TIME ZONE 'Asia/Jerusalem')::date + CASE WHEN extract(hour FROM now() AT TIME ZONE 'Asia/Jerusalem') >= c.reset_hour THEN 1 ELSE 0 END;
   dow := extract(dow FROM target)::integer;
   PERFORM pg_advisory_xact_lock(hashtextextended(c.child_id::text,0));
   INSERT INTO public.weekly_schedule_applications(child_id,selection_date,household_id) VALUES(c.child_id,target,c.household_id) ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS inserted=ROW_COUNT;
   IF inserted=0 THEN CONTINUE; END IF;
   IF EXISTS(SELECT 1 FROM public.selections WHERE child_id=c.child_id AND selection_date=target) OR EXISTS(SELECT 1 FROM public.parent_picks WHERE child_id=c.child_id AND selection_date=target) THEN CONTINUE; END IF;
   FOR f IN SELECT fi.* FROM public.weekly_schedule_items w JOIN public.food_items fi ON fi.id=w.food_item_id AND fi.household_id=c.household_id WHERE w.child_id=c.child_id AND w.weekday=dow AND fi.is_active AND (fi.allowed_days IS NULL OR cardinality(fi.allowed_days)=0 OR dow=ANY(fi.allowed_days)) ORDER BY w.sort_order,w.food_item_id LOOP
     IF f.weekly_limit IS NOT NULL AND (SELECT count(*) FROM public.selections WHERE child_id=c.child_id AND food_item_id=f.id AND selection_date BETWEEN target-dow AND target) >= f.weekly_limit THEN CONTINUE; END IF;
     IF EXISTS(SELECT 1 FROM public.categories cat WHERE cat.household_id=c.household_id AND (cat.id=f.category_id OR EXISTS(SELECT 1 FROM public.food_item_categories WHERE food_item_id=f.id AND category_id=cat.id)) AND (SELECT count(DISTINCT sel.food_item_id) FROM public.selections sel JOIN public.food_items sf ON sf.id=sel.food_item_id WHERE sel.child_id=c.child_id AND sel.selection_date=target AND (sf.category_id=cat.id OR EXISTS(SELECT 1 FROM public.food_item_categories WHERE food_item_id=sf.id AND category_id=cat.id))) >= cat.max_selections) THEN CONTINUE; END IF;
     INSERT INTO public.selections(household_id,child_id,food_item_id,selection_date) VALUES(c.household_id,c.child_id,f.id,target) ON CONFLICT(child_id,food_item_id,selection_date) DO NOTHING;
   END LOOP;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.fill_weekly_schedules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fill_weekly_schedules(uuid) TO authenticated,service_role;