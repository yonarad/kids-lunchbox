import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, todayInIsrael, getResetHour, formatHebrewDate } from "@/lib/household";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/prep")({
  component: PrepList,
});

interface Row {
  child_name: string;
  child_emoji: string;
  child_color: string;
  parent_pick: boolean;
  items: { name: string; emoji: string | null; image_url: string | null; category: string; category_emoji: string }[];
}

interface SelectionRow {
  child_id: string;
  food_item_id: string;
}

interface ChildRow {
  id: string;
  name: string;
  avatar_emoji: string;
  avatar_color: string;
}

interface FoodRow {
  id: string;
  name: string;
  emoji: string | null;
  image_url: string | null;
  category_id: string;
}

interface CategoryRow {
  id: string;
  name: string;
  emoji: string;
}

function PrepList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<string>(todayInIsrael(12));

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const hid = await getMyHouseholdId(user.id);
    if (!hid) return;
    const resetHour = await getResetHour(hid);
    const t = todayInIsrael(resetHour);
    setToday(t);
    const { data: selections } = await supabase
      .from("selections")
      .select("child_id, food_item_id")
      .eq("household_id", hid)
      .eq("selection_date", t);

    const childIds = [...new Set((selections ?? []).map((s) => s.child_id))];
    const itemIds = [...new Set((selections ?? []).map((s) => s.food_item_id))];

    if (childIds.length === 0 || itemIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [{ data: children }, { data: items }] = await Promise.all([
      supabase.from("children").select("id,name,avatar_emoji,avatar_color").in("id", childIds),
      supabase.from("food_items").select("id,name,emoji,image_url,category_id").in("id", itemIds),
    ]);

    const categoryIds = [...new Set((items ?? []).map((it) => it.category_id))];
    const { data: categories } = categoryIds.length > 0
      ? await supabase.from("categories").select("id,name,emoji").in("id", categoryIds)
      : { data: [] as CategoryRow[] };

    const childrenById = new Map((children as ChildRow[] | null ?? []).map((c) => [c.id, c]));
    const itemsById = new Map((items as FoodRow[] | null ?? []).map((it) => [it.id, it]));
    const categoriesById = new Map((categories as CategoryRow[] | null ?? []).map((c) => [c.id, c]));

    const grouped = new Map<string, Row>();
    for (const s of (selections as SelectionRow[] | null ?? [])) {
      const c = childrenById.get(s.child_id);
      const it = itemsById.get(s.food_item_id);
      if (!c || !it) continue;
      const category = categoriesById.get(it.category_id);
      const key = c.id;
      if (!grouped.has(key)) {
        grouped.set(key, { child_name: c.name, child_emoji: c.avatar_emoji, child_color: c.avatar_color, items: [] });
      }
      grouped.get(key)!.items.push({ name: it.name, emoji: it.emoji, image_url: it.image_url ?? null, category: category?.name ?? "", category_emoji: category?.emoji ?? "" });
    }
    setRows(Array.from(grouped.values()));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">רשימת הכנה 📋</h1>
          <p className="text-muted-foreground">{formatHebrewDate(today)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4 ml-1" /> רענון</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 ml-1" /> הדפסה</Button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center">טוען...</Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-6xl mb-3">😴</div>
          <p className="text-lg font-medium">עדיין לא בחרו פריטים להיום</p>
          <p className="text-sm text-muted-foreground mt-1">הבחירות יופיעו כאן ברגע שהילדים יבחרו</p>
        </Card>
      ) : (
        rows.map((r) => (
          <Card key={r.child_name} className="p-5 shadow-card">
            <div className="flex items-center gap-3 mb-3 pb-3 border-b">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ backgroundColor: r.child_color }}>
                {r.child_emoji}
              </div>
              <h2 className="text-xl font-bold">{r.child_name}</h2>
              <span className="text-sm text-muted-foreground mr-auto">{r.items.length} פריטים</span>
            </div>
            <ul className="space-y-2">
              {r.items.map((it, i) => (
                <li key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/50">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <span className="text-2xl">{it.emoji ?? it.category_emoji}</span>
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{it.category}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
