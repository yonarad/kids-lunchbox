import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/app/history")({
  component: History,
});

interface Sel {
  selection_date: string;
  child: { name: string; avatar_emoji: string; avatar_color: string } | null;
  item: { name: string; emoji: string | null } | null;
}

function History() {
  const { user } = useAuth();
  const [data, setData] = useState<Sel[]>([]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const hid = await getMyHouseholdId(user.id);
      if (!hid) return;
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data: rows } = await supabase
        .from("selections")
        .select("selection_date, child:children(name,avatar_emoji,avatar_color), item:food_items(name,emoji)")
        .eq("household_id", hid)
        .gte("selection_date", since.toISOString().split("T")[0])
        .order("selection_date", { ascending: false });
      setData((rows as any) ?? []);
    })();
  }, [user]);

  // Group by date then by child
  const byDate = new Map<string, Map<string, Sel[]>>();
  for (const s of data) {
    if (!s.child) continue;
    if (!byDate.has(s.selection_date)) byDate.set(s.selection_date, new Map());
    const childMap = byDate.get(s.selection_date)!;
    const k = s.child.name;
    if (!childMap.has(k)) childMap.set(k, []);
    childMap.get(k)!.push(s);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold">היסטוריה 📚</h1>
        <p className="text-muted-foreground">30 הימים האחרונים</p>
      </div>
      {byDate.size === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-6xl mb-3">🕊️</div>
          <p>עדיין אין היסטוריה</p>
        </Card>
      ) : (
        Array.from(byDate.entries()).map(([date, childMap]) => (
          <Card key={date} className="p-5 shadow-card">
            <h2 className="font-bold text-lg mb-3">
              {new Date(date).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
            </h2>
            <div className="space-y-3">
              {Array.from(childMap.entries()).map(([childName, sels]) => {
                const child = sels[0].child!;
                return (
                  <div key={childName} className="flex items-start gap-3 bg-secondary/40 rounded-2xl p-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: child.avatar_color }}>
                      {child.avatar_emoji}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm mb-1">{childName}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sels.map((s, i) => s.item && (
                          <span key={i} className="bg-card rounded-lg px-2 py-1 text-xs">
                            {s.item.emoji} {s.item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
