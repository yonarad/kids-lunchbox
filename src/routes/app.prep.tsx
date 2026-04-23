import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, todayInIsrael, getResetHour } from "@/lib/household";
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
  items: { name: string; emoji: string | null; image_url: string | null; category: string; category_emoji: string }[];
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
    const { data } = await supabase
      .from("selections")
      .select("child:children(name,avatar_emoji,avatar_color), item:food_items(name,emoji,image_url,category:categories(name,emoji))")
      .eq("household_id", hid)
      .eq("selection_date", t);
    const grouped = new Map<string, Row>();
    for (const s of data ?? []) {
      const c = s.child as any; const it = s.item as any;
      if (!c || !it) continue;
      const key = c.name;
      if (!grouped.has(key)) {
        grouped.set(key, { child_name: c.name, child_emoji: c.avatar_emoji, child_color: c.avatar_color, items: [] });
      }
      grouped.get(key)!.items.push({ name: it.name, emoji: it.emoji, image_url: it.image_url ?? null, category: it.category?.name ?? "", category_emoji: it.category?.emoji ?? "" });
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
          <p className="text-muted-foreground">{new Date(today).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}</p>
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
