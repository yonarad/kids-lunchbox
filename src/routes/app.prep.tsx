import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, todayInIsrael, getResetHour, formatHebrewDate } from "@/lib/household";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, RefreshCw, CheckCheck, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/app/prep")({
  component: PrepList,
});

interface PrepItem {
  id: string; // food_item_id (or "parent-pick" sentinel)
  name: string;
  emoji: string | null;
  image_url: string | null;
  category: string;
  category_emoji: string;
}

interface Row {
  child_id: string;
  child_name: string;
  child_emoji: string;
  child_color: string;
  parent_pick: boolean;
  items: PrepItem[];
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

const storageKey = (hid: string, date: string) => `prep-done:${hid}:${date}`;
const itemKey = (childId: string, itemId: string) => `${childId}:${itemId}`;

function PrepList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<string>(todayInIsrael(12));
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [expandOverride, setExpandOverride] = useState<Set<string>>(new Set());

  // Load prepared state from localStorage when household/date is known
  useEffect(() => {
    if (!householdId) return;
    try {
      const raw = localStorage.getItem(storageKey(householdId, today));
      setDone(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setDone(new Set());
    }
  }, [householdId, today]);

  const persist = (next: Set<string>) => {
    setDone(next);
    if (householdId) {
      try {
        localStorage.setItem(storageKey(householdId, today), JSON.stringify([...next]));
      } catch {
        /* ignore quota errors */
      }
    }
  };

  const toggleItem = (childId: string, itemId: string) => {
    const key = itemKey(childId, itemId);
    const next = new Set(done);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persist(next);
  };

  const setAllForChild = (row: Row, value: boolean) => {
    const next = new Set(done);
    const keys = row.parent_pick && row.items.length === 0
      ? [itemKey(row.child_id, "parent-pick")]
      : row.items.map((it) => itemKey(row.child_id, it.id));
    for (const k of keys) {
      if (value) next.add(k);
      else next.delete(k);
    }
    persist(next);
  };

  const isChildFullyDone = (row: Row) => {
    if (row.parent_pick && row.items.length === 0) {
      return done.has(itemKey(row.child_id, "parent-pick"));
    }
    return row.items.length > 0 && row.items.every((it) => done.has(itemKey(row.child_id, it.id)));
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const hid = await getMyHouseholdId(user.id);
    if (!hid) return;
    setHouseholdId(hid);
    const resetHour = await getResetHour(hid);
    const t = todayInIsrael(resetHour);
    setToday(t);
    const [{ data: selections }, { data: parentPicks }] = await Promise.all([
      supabase
        .from("selections")
        .select("child_id, food_item_id")
        .eq("household_id", hid)
        .eq("selection_date", t),
      supabase
        .from("parent_picks")
        .select("child_id")
        .eq("household_id", hid)
        .eq("selection_date", t),
    ]);

    const selChildIds = [...new Set((selections ?? []).map((s) => s.child_id))];
    const ppChildIds = [...new Set((parentPicks ?? []).map((p) => p.child_id))];
    const childIds = [...new Set([...selChildIds, ...ppChildIds])];
    const itemIds = [...new Set((selections ?? []).map((s) => s.food_item_id))];

    if (childIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [{ data: children }, { data: items }] = await Promise.all([
      supabase.from("children").select("id,name,avatar_emoji,avatar_color").in("id", childIds),
      itemIds.length > 0
        ? supabase.from("food_items").select("id,name,emoji,image_url,category_id").in("id", itemIds)
        : Promise.resolve({ data: [] as FoodRow[] }),
    ]);

    const categoryIds = [...new Set((items ?? []).map((it) => it.category_id))];
    const { data: categories } = categoryIds.length > 0
      ? await supabase.from("categories").select("id,name,emoji").in("id", categoryIds)
      : { data: [] as CategoryRow[] };

    const childrenById = new Map((children as ChildRow[] | null ?? []).map((c) => [c.id, c]));
    const itemsById = new Map((items as FoodRow[] | null ?? []).map((it) => [it.id, it]));
    const categoriesById = new Map((categories as CategoryRow[] | null ?? []).map((c) => [c.id, c]));
    const parentPickSet = new Set(ppChildIds);

    const grouped = new Map<string, Row>();
    for (const cid of ppChildIds) {
      const c = childrenById.get(cid);
      if (!c) continue;
      grouped.set(cid, { child_id: c.id, child_name: c.name, child_emoji: c.avatar_emoji, child_color: c.avatar_color, parent_pick: true, items: [] });
    }
    for (const s of (selections as SelectionRow[] | null ?? [])) {
      const c = childrenById.get(s.child_id);
      const it = itemsById.get(s.food_item_id);
      if (!c || !it) continue;
      const category = categoriesById.get(it.category_id);
      const key = c.id;
      if (!grouped.has(key)) {
        grouped.set(key, { child_id: c.id, child_name: c.name, child_emoji: c.avatar_emoji, child_color: c.avatar_color, parent_pick: parentPickSet.has(c.id), items: [] });
      }
      grouped.get(key)!.items.push({ id: it.id, name: it.name, emoji: it.emoji, image_url: it.image_url ?? null, category: category?.name ?? "", category_emoji: category?.emoji ?? "" });
    }
    setRows(Array.from(grouped.values()));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const totals = useMemo(() => {
    let total = 0, completed = 0;
    for (const r of rows) {
      if (r.parent_pick && r.items.length === 0) {
        total += 1;
        if (done.has(itemKey(r.child_id, "parent-pick"))) completed += 1;
      } else {
        total += r.items.length;
        for (const it of r.items) if (done.has(itemKey(r.child_id, it.id))) completed += 1;
      }
    }
    return { total, completed };
  }, [rows, done]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">רשימת הכנה 📋</h1>
          <p className="text-muted-foreground">{formatHebrewDate(today)}</p>
          {totals.total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              הוכן {totals.completed} מתוך {totals.total}
            </p>
          )}
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
        rows.map((r) => {
          const allDone = isChildFullyDone(r);
          const forcedOpen = expandOverride.has(r.child_id);
          const collapsed = allDone && !forcedOpen;
          const toggleCollapsed = () => {
            const next = new Set(expandOverride);
            if (next.has(r.child_id)) next.delete(r.child_id);
            else next.add(r.child_id);
            setExpandOverride(next);
          };
          return (
            <Card key={r.child_id} className={`p-5 shadow-card transition-opacity ${r.parent_pick ? "border-2 border-primary/40 bg-primary/5" : ""} ${allDone ? "opacity-70" : ""}`}>
              <div className={`flex items-center gap-3 ${collapsed ? "" : "mb-3 pb-3 border-b"}`}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: r.child_color }}>
                  {r.child_emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    {r.child_name}
                    {allDone && <span className="text-sm font-normal text-green-600">✓ הוכן</span>}
                  </h2>
                  {r.parent_pick ? (
                    <span className="text-sm font-bold text-primary">💛 אבא בוחר</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{r.items.length} פריטים</span>
                  )}
                </div>
                {allDone ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="print:hidden shrink-0"
                    onClick={toggleCollapsed}
                    aria-label={collapsed ? "הרחב" : "כווץ"}
                  >
                    {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="print:hidden shrink-0"
                    onClick={() => setAllForChild(r, true)}
                  >
                    <CheckCheck className="w-4 h-4 ml-1" /> סמן הכל
                  </Button>
                )}
              </div>
              {collapsed ? null : (
                <>
                  {allDone && (
                    <div className="flex justify-end mb-2 print:hidden">
                      <Button variant="ghost" size="sm" onClick={() => setAllForChild(r, false)}>
                        <RotateCcw className="w-4 h-4 ml-1" /> בטל סימון
                      </Button>
                    </div>
                  )}
                  {r.parent_pick && r.items.length === 0 ? (
                    <label className="flex items-center gap-3 p-2 rounded-xl cursor-pointer hover:bg-secondary/50">
                      <Checkbox
                        checked={done.has(itemKey(r.child_id, "parent-pick"))}
                        onCheckedChange={() => toggleItem(r.child_id, "parent-pick")}
                        className="print:hidden"
                      />
                      <div className="flex-1 text-center">
                        <p className="text-base font-medium">תכין/י את הקופסה בעצמך 🍱</p>
                        <p className="text-sm text-muted-foreground mt-1">{r.child_name} ביקש/ה שאבא יבחר</p>
                      </div>
                    </label>
                  ) : (
                    <ul className="space-y-2">
                      {r.items.map((it) => {
                        const checked = done.has(itemKey(r.child_id, it.id));
                        return (
                          <li key={it.id}>
                            <label className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer hover:bg-secondary/50 ${checked ? "opacity-60" : ""}`}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleItem(r.child_id, it.id)}
                                className="print:hidden"
                              />
                          {it.image_url ? (
                            <img src={it.image_url} alt={it.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                          ) : (
                            <span className="text-2xl">{it.emoji ?? it.category_emoji}</span>
                          )}
                          <div className="flex-1">
                            <p className={`font-medium ${checked ? "line-through" : ""}`}>{it.name}</p>
                            <p className="text-xs text-muted-foreground">{it.category}</p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
