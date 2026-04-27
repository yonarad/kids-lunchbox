import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, todayInIsrael, getResetHour } from "@/lib/household";
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
  // Map: itemId -> array of categoryIds it belongs to
  const [itemCats, setItemCats] = useState<Record<string, string[]>>({});
  // Selected item ids (flat — one selection per item, counts in all its categories)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [parentPick, setParentPick] = useState(false);
  const [today, setToday] = useState<string>(todayInIsrael(12));

  useEffect(() => {
    (async () => {
      if (!user) return;
      const id = await getMyHouseholdId(user.id);
      setHid(id);
      if (!id) return;
      const resetHour = await getResetHour(id);
      const t = todayInIsrael(resetHour);
      setToday(t);
      const [{ data: kids }, { data: c }, { data: f }, { data: sels }, { data: fic }, { data: ppicks }] = await Promise.all([
        supabase.from("children").select("*").eq("household_id", id).order("created_at"),
        supabase.from("categories").select("*").eq("household_id", id).order("sort_order"),
        supabase.from("food_items").select("*").eq("household_id", id).eq("is_active", true),
        supabase.from("selections").select("*").eq("household_id", id).eq("selection_date", t),
        supabase.from("food_item_categories").select("food_item_id, category_id").eq("household_id", id),
        supabase.from("parent_picks").select("child_id").eq("household_id", id).eq("selection_date", t),
      ]);

      // If this user is a child themselves, restrict to that child only
      const myChildRecord = (kids ?? []).find((k) => (k as any).user_id === user.id) ?? null;
      const visibleKids = myChildRecord ? [myChildRecord] : (kids ?? []);
      setChildren(visibleKids);

      setCats(c ?? []);
      setItems(f ?? []);
      const map: Record<string, string[]> = {};
      for (const row of fic ?? []) {
        map[row.food_item_id] = [...(map[row.food_item_id] ?? []), row.category_id];
      }
      for (const it of f ?? []) {
        if (!map[it.id] && it.category_id) map[it.id] = [it.category_id];
      }
      setItemCats(map);

      // Auto-pick child: if kid user → their record; else from search
      let target: Child | null = null;
      if (myChildRecord) {
        target = myChildRecord;
      } else if (search.child) {
        target = (kids ?? []).find((k) => k.id === search.child) ?? null;
      }
      setChild(target);
      setActiveCat(c?.[0]?.id ?? null);
      if (target) {
        const my = (sels ?? []).filter((s) => s.child_id === target!.id).map((s) => s.food_item_id);
        setSelectedIds(my);
        const isParentPick = (ppicks ?? []).some((p) => p.child_id === target!.id);
        setParentPick(isParentPick);
        if (my.length > 0 || isParentPick) setDone(true);
      } else {
        setSelectedIds([]);
        setParentPick(false);
        setDone(false);
      }
    })();
  }, [user, search.child]);

  // Items visible in a category = any item linked to that category
  const itemsForCat = useMemo(
    () => (catId: string) => items.filter((i) => (itemCats[i.id] ?? [i.category_id]).includes(catId)),
    [items, itemCats]
  );

  // Count selections in a category (any selected item linked to it)
  const countForCat = (catId: string) =>
    selectedIds.filter((id) => (itemCats[id] ?? []).includes(catId)).length;

  const toggleItem = (catId: string, itemId: string) => {
    const cat = cats.find((c) => c.id === catId)!;
    if (selectedIds.includes(itemId)) {
      setSelectedIds(selectedIds.filter((id) => id !== itemId));
      return;
    }
    // Check the quota of EVERY category this item belongs to
    const itemCatIds = itemCats[itemId] ?? [catId];
    for (const cid of itemCatIds) {
      const c = cats.find((x) => x.id === cid);
      if (!c) continue;
      const current = countForCat(cid);
      if (current >= c.max_selections) {
        toast.error(`כבר בחרתם את המקסימום בקטגוריה "${c.name}"`);
        return;
      }
    }
    setSelectedIds([...selectedIds, itemId]);
    void cat;
  };

  const askParentToChoose = async () => {
    if (!child || !hid) return;
    // Clear any existing selections for today
    await supabase.from("selections").delete().eq("household_id", hid).eq("child_id", child.id).eq("selection_date", today);
    // Mark that the parent will choose
    const { error } = await supabase
      .from("parent_picks")
      .upsert({ household_id: hid, child_id: child.id, selection_date: today }, { onConflict: "child_id,selection_date" });
    if (error) { toast.error(error.message); return; }
    setSelectedIds([]);
    setParentPick(true);
    setDone(true);
    toast.success("נהדר! אבא יבחר עבורך 💛");
  };

  const finish = async () => {
    if (!child || !hid) return;
    await supabase.from("selections").delete().eq("household_id", hid).eq("child_id", child.id).eq("selection_date", today);
    // Remove any "parent picks" marker since the child is choosing themselves
    await supabase.from("parent_picks").delete().eq("household_id", hid).eq("child_id", child.id).eq("selection_date", today);
    const rows = selectedIds.map((itemId) => ({
      household_id: hid, child_id: child.id, food_item_id: itemId, selection_date: today,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("selections").insert(rows);
      if (error) { toast.error(error.message); return; }
    }
    setParentPick(false);
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

  const removeItem = async (itemId: string) => {
    if (!child || !hid) return;
    setSelectedIds(selectedIds.filter((id) => id !== itemId));
    const { error } = await supabase
      .from("selections")
      .delete()
      .eq("household_id", hid)
      .eq("child_id", child.id)
      .eq("selection_date", today)
      .eq("food_item_id", itemId);
    if (error) { toast.error(error.message); return; }
    toast.success("הוסר מהקופסה");
  };

  if (done) return <BoxView child={child} items={items} selectedIds={selectedIds} parentPick={parentPick} onEdit={() => setDone(false)} onRemove={removeItem} />;

  const activeCategory = cats.find((c) => c.id === activeCat);
  const activeItems = activeCat ? itemsForCat(activeCat) : [];
  const totalSelected = selectedIds.length;

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
          const count = countForCat(c.id);
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
              const isSel = selectedIds.includes(it.id);
              const otherCats = (itemCats[it.id] ?? []).filter((cid) => cid !== activeCat);
              // Disabled if not selected AND any of its categories has reached max
              const itemCatIds = itemCats[it.id] ?? [it.category_id];
              const isDisabled = !isSel && itemCatIds.some((cid) => {
                const c = cats.find((x) => x.id === cid);
                return c ? countForCat(cid) >= c.max_selections : false;
              });
              return (
                <button
                  key={it.id}
                  onClick={() => !isDisabled && toggleItem(activeCat!, it.id)}
                  disabled={isDisabled}
                  className={`relative rounded-3xl overflow-hidden transition-all ${
                    isSel
                      ? "ring-4 ring-primary scale-95 shadow-pop"
                      : isDisabled
                        ? "opacity-40 grayscale cursor-not-allowed shadow-card"
                        : "shadow-card hover:scale-105 active:scale-95"
                  }`}
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
                    {otherCats.length > 0 && (
                      <p className="text-[10px] text-muted-foreground text-center truncate">
                        גם ב: {otherCats.map((cid) => cats.find((c) => c.id === cid)?.emoji).filter(Boolean).join(" ")}
                      </p>
                    )}
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
          <Button variant="secondary" size="lg" onClick={askParentToChoose} className="rounded-2xl flex-1">
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
  child, items, selectedIds, parentPick, onEdit, onRemove,
}: {
  child: Child; items: FoodItem[];
  selectedIds: string[]; parentPick: boolean; onEdit: () => void;
  onRemove: (itemId: string) => void;
}) {
  const allSelectedItems = selectedIds.map((id) => items.find((i) => i.id === id)).filter(Boolean) as FoodItem[];
  if (parentPick) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 pt-16 text-center">
        <div className="text-7xl mb-4 animate-pop-in">💛</div>
        <h1 className="text-3xl md:text-4xl mb-2">אבא יבחר עבור {child.name}</h1>
        <p className="text-muted-foreground mb-6">סימנו שאבא יכין את הקופסה היום</p>
        <Button variant="secondary" onClick={onEdit} className="rounded-2xl">בכל זאת אבחר בעצמי</Button>
      </div>
    );
  }
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
              <div key={it.id + i} className="relative aspect-square rounded-2xl bg-white shadow-soft overflow-hidden flex items-center justify-center animate-pop-in">
                {it.image_url ? (
                  <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-6xl">{it.emoji}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(it.id)}
                  aria-label={`הסר ${it.name}`}
                  className="absolute top-1 left-1 bg-destructive text-destructive-foreground rounded-full w-7 h-7 flex items-center justify-center shadow-pop hover:scale-110 active:scale-95 transition-transform"
                >
                  <X className="w-4 h-4" />
                </button>
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
