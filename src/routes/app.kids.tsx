import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, todayInIsrael } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/kids")({
  validateSearch: (s: Record<string, unknown>) => ({ child: (s.child as string) || "" }),
  component: KidsView,
});

interface Child { id: string; name: string; avatar_color: string; avatar_emoji: string }
interface Category { id: string; name: string; emoji: string; color: string; max_selections: number; sort_order: number }
interface FoodItem { id: string; category_id: string; name: string; image_url: string | null; emoji: string | null; is_active: boolean }

function KidsView() {
  const { user } = useAuth();
  const search = useSearch({ from: "/app/kids" });
  const navigate = useNavigate();
  const [hid, setHid] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [child, setChild] = useState<Child | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({}); // catId -> itemIds
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const today = todayInIsrael();

  useEffect(() => {
    (async () => {
      if (!user) return;
      const id = await getMyHouseholdId(user.id);
      setHid(id);
      if (!id) return;
      const [{ data: kids }, { data: c }, { data: f }, { data: sels }] = await Promise.all([
        supabase.from("children").select("*").eq("household_id", id).order("created_at"),
        supabase.from("categories").select("*").eq("household_id", id).order("sort_order"),
        supabase.from("food_items").select("*").eq("household_id", id).eq("is_active", true),
        supabase.from("selections").select("*").eq("household_id", id).eq("selection_date", today),
      ]);
      setChildren(kids ?? []);
      setCats(c ?? []);
      setItems(f ?? []);
      // Only auto-select a child if one was explicitly chosen via search param
      const target = search.child ? (kids ?? []).find((k) => k.id === search.child) ?? null : null;
      setChild(target);
      setActiveCat(c?.[0]?.id ?? null);
      // pre-load existing selections for this child
      if (target) {
        const my = (sels ?? []).filter((s) => s.child_id === target.id);
        const grouped: Record<string, string[]> = {};
        for (const s of my) {
          const item = (f ?? []).find((i) => i.id === s.food_item_id);
          if (!item) continue;
          grouped[item.category_id] = [...(grouped[item.category_id] ?? []), s.food_item_id];
        }
        setSelected(grouped);
        if (my.length > 0) setDone(true);
      } else {
        setSelected({});
        setDone(false);
      }
    })();
  }, [user, search.child]);

  const itemsForCat = useMemo(() => (catId: string) => items.filter((i) => i.category_id === catId), [items]);

  const toggleItem = (catId: string, itemId: string) => {
    const cat = cats.find((c) => c.id === catId)!;
    const current = selected[catId] ?? [];
    if (current.includes(itemId)) {
      setSelected({ ...selected, [catId]: current.filter((id) => id !== itemId) });
    } else {
      if (current.length >= cat.max_selections) {
        // replace oldest
        setSelected({ ...selected, [catId]: [...current.slice(1), itemId] });
      } else {
        setSelected({ ...selected, [catId]: [...current, itemId] });
      }
    }
  };

  const surpriseMe = () => {
    const newSel: Record<string, string[]> = {};
    for (const cat of cats) {
      const pool = itemsForCat(cat.id);
      if (pool.length === 0) continue;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      newSel[cat.id] = shuffled.slice(0, Math.min(cat.max_selections, pool.length)).map((i) => i.id);
    }
    setSelected(newSel);
    toast.success("אבא בחר בשבילך! 🎲");
  };

  const finish = async () => {
    if (!child || !hid) return;
    // Replace today's selections for this child
    await supabase.from("selections").delete().eq("household_id", hid).eq("child_id", child.id).eq("selection_date", today);
    const rows = Object.values(selected).flat().map((itemId) => ({
      household_id: hid, child_id: child.id, food_item_id: itemId, selection_date: today,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("selections").insert(rows);
      if (error) { toast.error(error.message); return; }
    }
    setDone(true);
    toast.success("יששש! הקופסה מוכנה 🎉");
  };

  if (!child) {
    if (children.length === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div>
            <div className="text-6xl mb-3">🍱</div>
            <p className="text-xl mb-4">צריך להוסיף ילד לפני שמתחילים</p>
            <Button onClick={() => navigate({ to: "/app" })}>חזרה</Button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-2xl w-full text-center">
          <div className="text-6xl mb-3">🍱</div>
          <h1 className="text-3xl font-bold mb-2">מי בוחר עכשיו?</h1>
          <p className="text-muted-foreground mb-8">לחצו על השם שלכם כדי להתחיל לבנות את הקופסה</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {children.map((k) => (
              <button
                key={k.id}
                onClick={() => navigate({ to: "/app/kids", search: { child: k.id } })}
                className="bg-card rounded-3xl p-6 shadow-card hover:scale-105 active:scale-95 transition-transform"
              >
                <div
                  className="w-24 h-24 mx-auto rounded-3xl flex items-center justify-center text-6xl shadow-soft mb-3"
                  style={{ backgroundColor: k.avatar_color }}
                >
                  {k.avatar_emoji}
                </div>
                <p className="text-xl font-bold">{k.name}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (done) return <BoxView child={child} cats={cats} items={items} selected={selected} onEdit={() => setDone(false)} />;

  const activeCategory = cats.find((c) => c.id === activeCat);
  const activeItems = activeCat ? itemsForCat(activeCat) : [];
  const totalSelected = Object.values(selected).flat().length;

  return (
    <div className="min-h-screen p-4 md:p-6 pt-16">
      {/* Header with child */}
      <div className="max-w-5xl mx-auto mb-4 flex items-center gap-3 bg-card/80 backdrop-blur rounded-3xl p-3 shadow-card">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-soft" style={{ backgroundColor: child.avatar_color }}>
          {child.avatar_emoji}
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">בוחרים עבור</p>
          <h1 className="text-xl font-bold">{child.name}</h1>
        </div>
        {children.length > 1 && (
          <select
            value={child.id}
            onChange={(e) => navigate({ to: "/app/kids", search: { child: e.target.value } })}
            className="rounded-xl border bg-background px-3 py-2 text-sm"
          >
            {children.map((c) => <option key={c.id} value={c.id}>{c.avatar_emoji} {c.name}</option>)}
          </select>
        )}
      </div>

      {/* Category tabs */}
      <div className="max-w-5xl mx-auto mb-4 flex gap-2 overflow-x-auto pb-2">
        {cats.map((c) => {
          const count = (selected[c.id] ?? []).length;
          const isActive = c.id === activeCat;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`flex-shrink-0 rounded-2xl px-4 py-3 transition-all ${isActive ? "bg-primary text-primary-foreground shadow-pop scale-105" : "bg-card shadow-card"}`}
            >
              <div className="text-3xl">{c.emoji}</div>
              <div className="text-sm font-bold">{c.name}</div>
              <div className="text-xs opacity-80">{count}/{c.max_selections}</div>
            </button>
          );
        })}
      </div>

      {/* Items grid */}
      <div className="max-w-5xl mx-auto">
        {activeCategory && (
          <p className="text-center text-muted-foreground mb-3">
            {activeCategory.max_selections === 1 ? "בחרו פריט אחד" : `אפשר לבחור עד ${activeCategory.max_selections} פריטים`}
          </p>
        )}
        {activeItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="text-5xl mb-2">🤷</div>
            אין פריטים זמינים בקטגוריה הזו
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {activeItems.map((it) => {
              const isSel = (selected[it.category_id] ?? []).includes(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => toggleItem(it.category_id, it.id)}
                  className={`relative rounded-3xl overflow-hidden transition-all ${isSel ? "ring-4 ring-primary scale-95 shadow-pop" : "shadow-card hover:scale-105 active:scale-95"}`}
                >
                  <div className="aspect-square bg-secondary flex items-center justify-center">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-7xl">{it.emoji}</span>
                    )}
                  </div>
                  <div className="bg-card p-2">
                    <p className="text-sm font-bold text-center truncate">{it.name}</p>
                  </div>
                  {isSel && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-9 h-9 flex items-center justify-center shadow-pop animate-pop-in">
                      <Check className="w-5 h-5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t shadow-pop p-3 z-30">
        <div className="max-w-5xl mx-auto flex gap-2">
          <Button variant="secondary" size="lg" onClick={surpriseMe} className="rounded-2xl flex-1">
            <Sparkles className="w-5 h-5 ml-2" /> אבא בוחר בשבילי
          </Button>
          <Button size="lg" onClick={finish} disabled={totalSelected === 0} className="rounded-2xl flex-1 shadow-pop">
            סיימתי! ({totalSelected}) 🎉
          </Button>
        </div>
      </div>
      <div className="h-24" />
    </div>
  );
}

function BoxView({
  child, cats, items, selected, onEdit,
}: {
  child: Child; cats: Category[]; items: FoodItem[];
  selected: Record<string, string[]>; onEdit: () => void;
}) {
  const allSelectedItems = Object.values(selected).flat().map((id) => items.find((i) => i.id === id)).filter(Boolean) as FoodItem[];
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 pt-16">
      <h1 className="text-3xl md:text-4xl mb-2">הקופסה של {child.name} מוכנה! 🎉</h1>
      <p className="text-muted-foreground mb-6">הנה מה שיש בפנים:</p>

      {/* Lunchbox illustration */}
      <div className="relative w-full max-w-md bg-gradient-leaf rounded-[2.5rem] p-5 shadow-pop border-8 border-secondary-foreground/20">
        <div className="bg-secondary rounded-3xl p-4 grid grid-cols-2 gap-3 min-h-[16rem]">
          {allSelectedItems.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-muted-foreground">קופסה ריקה</div>
          ) : (
            allSelectedItems.map((it, i) => (
              <div key={it.id + i} className="aspect-square rounded-2xl bg-white shadow-soft overflow-hidden flex items-center justify-center animate-pop-in">
                {it.image_url ? (
                  <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-6xl">{it.emoji}</span>
                )}
              </div>
            ))
          )}
        </div>
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-3 bg-secondary-foreground/30 rounded-full" />
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="secondary" onClick={onEdit} className="rounded-2xl"><X className="w-4 h-4 ml-1" /> שינוי</Button>
      </div>
    </div>
  );
}
