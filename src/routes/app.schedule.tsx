import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, Save, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { getMyHouseholdId } from "@/lib/household";
import { pageHead } from "@/lib/page-head";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { fillWeeklySchedules } from "@/lib/weekly-schedule";

export const Route = createFileRoute("/app/schedule")({
  head: () => pageHead("מערכת אוכל שבועית", "הגדרת מערכת אוכל קבועה ואופציונלית לכל ילד לפי ימי השבוע."),
  component: WeeklySchedule,
});

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
type Week = Record<number, string[]>;

function WeeklySchedule() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Tables<"children">[]>([]);
  const [foods, setFoods] = useState<Tables<"food_items">[]>([]);
  const [cats, setCats] = useState<Tables<"categories">[]>([]);
  const [links, setLinks] = useState<Record<string, string[]>>({});
  const [configs, setConfigs] = useState<Tables<"child_weekly_schedules">[]>([]);
  const [savedItems, setSavedItems] = useState<Tables<"weekly_schedule_items">[]>([]);
  const [childId, setChildId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [week, setWeek] = useState<Week>({});
  const [day, setDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) return;
      try {
        const hid = await getMyHouseholdId(user.id);
        if (!hid) throw new Error("לא נמצא בית משויך");
        const permission = await supabase.rpc("is_household_parent", { _household_id: hid, _user_id: user.id });
        if (permission.error || !permission.data) throw new Error("רק הורים יכולים לערוך מערכת שבועית");
        const results = await Promise.all([
          supabase.from("children").select("*").eq("household_id", hid).order("created_at"),
          supabase.from("food_items").select("*").eq("household_id", hid).order("created_at"),
          supabase.from("categories").select("*").eq("household_id", hid).order("sort_order"),
          supabase.from("food_item_categories").select("food_item_id,category_id").eq("household_id", hid),
          supabase.from("child_weekly_schedules").select("*").eq("household_id", hid),
          supabase.from("weekly_schedule_items").select("*").eq("household_id", hid).order("sort_order"),
        ]);
        for (const result of results) if (result.error) throw result.error;
        if (!alive) return;
        setChildren(results[0].data ?? []);
        setFoods(results[1].data ?? []);
        setCats(results[2].data ?? []);
        const map: Record<string, string[]> = {};
        for (const row of results[3].data ?? []) map[row.food_item_id] = [...(map[row.food_item_id] ?? []), row.category_id];
        setLinks(map);
        setConfigs(results[4].data ?? []);
        setSavedItems(results[5].data ?? []);
        setChildId(results[0].data?.[0]?.id ?? "");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "לא ניתן לטעון את המערכת השבועית");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    const draft: Week = {};
    for (const row of savedItems.filter((i) => i.child_id === childId)) draft[row.weekday] = [...(draft[row.weekday] ?? []), row.food_item_id];
    setWeek(draft);
    setEnabled(configs.find((c) => c.child_id === childId)?.enabled ?? false);
    setDirty(false);
  }, [childId, configs, savedItems]);

  const foodCats = (food: Tables<"food_items">) => links[food.id] ?? [food.category_id];
  const blockedReason = (food: Tables<"food_items">) => {
    if (!food.is_active) return "לא פעיל במזווה";
    if (food.allowed_days?.length && !food.allowed_days.includes(day)) return "לא זמין ביום הזה";
    const times = Object.values(week).filter((ids) => ids.includes(food.id)).length;
    if (food.weekly_limit != null && times >= food.weekly_limit) return `עד ${food.weekly_limit} בשבוע`;
    const full = cats.find((cat) => foodCats(food).includes(cat.id) && (week[day] ?? []).filter((id) => {
      const other = foods.find((f) => f.id === id);
      return other && foodCats(other).includes(cat.id);
    }).length >= cat.max_selections);
    return full ? `הקטגוריה ${full.name} מלאה` : "";
  };
  const toggleFood = (food: Tables<"food_items">) => {
    const selected = (week[day] ?? []).includes(food.id);
    if (!selected && blockedReason(food)) return;
    setWeek((prev) => ({ ...prev, [day]: selected ? (prev[day] ?? []).filter((id) => id !== food.id) : [...(prev[day] ?? []), food.id] }));
    setDirty(true);
  };
  const save = async () => {
    const child = children.find((c) => c.id === childId);
    if (!child || saving) return;
    setSaving(true);
    try {
      const items = Object.entries(week).flatMap(([weekday, ids]) => ids.map((food_item_id) => ({ weekday: Number(weekday), food_item_id })));
      const result = await supabase.rpc("save_weekly_schedule", { _child_id: childId, _enabled: enabled, _items: items });
      if (result.error) throw result.error;
      setConfigs((prev) => [...prev.filter((c) => c.child_id !== childId), { child_id: childId, household_id: child.household_id, enabled }]);
      setSavedItems((prev) => [...prev.filter((c) => c.child_id !== childId), ...items.map((item, sort_order) => ({ ...item, child_id: childId, household_id: child.household_id, sort_order }))]);
      setDirty(false);
      toast.success("המערכת השבועית נשמרה");
      await fillWeeklySchedules(child.household_id);
    } catch { toast.error("לא ניתן לשמור או למלא את המערכת. נסו שוב."); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-center py-12 text-muted-foreground">טוען מערכת שבועית…</p>;
  if (error) return <p role="alert" className="text-center py-12 text-destructive">{error}</p>;
  if (!children.length) return <p className="text-center py-12 text-muted-foreground">עדיין אין ילדים במשפחה</p>;
  const child = children.find((c) => c.id === childId);
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold flex items-center gap-2"><CalendarDays className="h-7 w-7 shrink-0" />מערכת שבועית</h1>
        <Button onClick={save} disabled={saving || !dirty}><Save className="h-4 w-4 ml-2" />{saving ? "שומר…" : "שמירה"}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-5 border-b pb-5">
        <div className="w-full sm:w-56 space-y-2">
          <Label htmlFor="schedule-child">ילד</Label>
          <Select dir="rtl" value={childId} onValueChange={(id) => {
            if (dirty && !window.confirm("לעבור לילד אחר בלי לשמור את השינויים?")) return;
            setChildId(id);
          }}><SelectTrigger id="schedule-child"><SelectValue /></SelectTrigger><SelectContent>{children.map((c) => <SelectItem key={c.id} value={c.id}>{c.avatar_emoji} {c.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="schedule-enabled" checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true); }} />
          <Label htmlFor="schedule-enabled">מילוי אוטומטי עבור {child?.name}</Label>
        </div>
        <span className="text-sm text-muted-foreground">{enabled ? "מערכת קבועה" : "בחירה חופשית"}</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2" role="tablist" aria-label="ימי השבוע">
        {DAYS.map((name, index) => <Button role="tab" aria-selected={day === index} key={name} variant={day === index ? "default" : "secondary"} className="h-auto min-h-14 flex-col gap-1 py-2" onClick={() => setDay(index)}>
          <span>{name}</span><span className="text-xs">{(week[index] ?? []).length} פריטים</span>
        </Button>)}
      </div>
      <section className="space-y-5" aria-label={`האוכל ליום ${DAYS[day]}`}>
        <h2 className="text-xl font-bold">יום {DAYS[day]}</h2>
        {cats.map((cat) => {
          const categoryFoods = foods.filter((f) => foodCats(f).includes(cat.id));
          if (!categoryFoods.length) return null;
          return <div key={cat.id} className="space-y-3">
            <h3 className="font-bold">{cat.emoji} {cat.name}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {categoryFoods.map((food) => {
                const selected = (week[day] ?? []).includes(food.id);
                const reason = blockedReason(food);
                return <Button key={food.id} variant="outline" aria-pressed={selected} aria-label={`${food.name}, יום ${DAYS[day]}`} disabled={saving || (!selected && !!reason)} onClick={() => toggleFood(food)} className={`relative h-auto min-w-0 flex-col gap-2 p-3 whitespace-normal ${selected ? "border-primary bg-primary/10 ring-2 ring-primary" : ""}`}>
                  <div className="aspect-square w-full bg-secondary rounded-md overflow-hidden flex items-center justify-center">
                    {food.image_url ? <img src={food.image_url} alt={food.name} className="w-full h-full object-cover" /> : <span className="text-5xl">{food.emoji}</span>}
                  </div>
                  <span className="break-words w-full text-center">{food.name}</span>
                  {selected && <Check className="absolute top-2 left-2 h-5 w-5 bg-primary text-primary-foreground rounded-full p-0.5" />}
                  {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
                </Button>;
              })}
            </div>
          </div>;
        })}
        {!foods.length && <p className="text-muted-foreground">אין עדיין מוצרים במזווה</p>}
      </section>
      <div className="sticky bottom-0 bg-background/95 border-t py-3 flex justify-end">
        <Button onClick={save} disabled={saving || !dirty}><Save className="w-4 h-4 ml-2" />{saving ? "שומר…" : "שמירת המערכת"}</Button>
      </div>
    </div>
  );
}