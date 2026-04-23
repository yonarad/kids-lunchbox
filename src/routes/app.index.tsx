import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, todayInIsrael, getResetHour } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

const COLORS = ["#FFB6C1", "#FFD93D", "#90EE90", "#87CEEB", "#FFA07A", "#DDA0DD"];
const EMOJIS = ["🙂", "😊", "🥰", "😎", "🦄", "🐯", "🐰", "🐼", "🦊", "🐸"];

interface Child { id: string; name: string; avatar_color: string; avatar_emoji: string }

function Dashboard() {
  const { user } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  const load = async () => {
    if (!user) return;
    const hid = await getMyHouseholdId(user.id);
    setHouseholdId(hid);
    if (!hid) return;
    const { data: kids } = await supabase
      .from("children")
      .select("*")
      .eq("household_id", hid)
      .order("created_at");
    setChildren(kids ?? []);
    const resetHour = await getResetHour(hid);
    const today = todayInIsrael(resetHour);
    const { data: sels } = await supabase
      .from("selections")
      .select("child_id")
      .eq("household_id", hid)
      .eq("selection_date", today);
    const counts: Record<string, number> = {};
    (sels ?? []).forEach((s) => { counts[s.child_id] = (counts[s.child_id] ?? 0) + 1; });
    setTodayCounts(counts);
  };

  useEffect(() => { load(); }, [user]);

  const addChild = async () => {
    if (!householdId || !name.trim()) return;
    const { error } = await supabase.from("children").insert({
      household_id: householdId,
      name: name.trim(),
      avatar_color: color,
      avatar_emoji: emoji,
    });
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success("נוסף ילד חדש 🎉");
    setName(""); setOpen(false);
    load();
  };

  const removeChild = async (id: string) => {
    if (!confirm("למחוק את הילד וכל ההיסטוריה שלו?")) return;
    await supabase.from("children").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-gradient-sunny rounded-3xl p-6 md:p-8 shadow-soft">
        <h1 className="text-3xl md:text-4xl text-primary-foreground mb-2">שלום! 👋</h1>
        <p className="text-primary-foreground/90 text-lg">
          {children.length === 0
            ? "כדי להתחיל, הוסיפו ילד ראשון למשפחה."
            : "מוכנים להכין קופסאות אוכל מדהימות?"}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">הילדים שלי</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl"><Plus className="w-4 h-4 ml-1" /> הוספת ילד</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>ילד חדש</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">שם</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: נועה" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">בחרו אווטאר</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmoji(e)}
                      className={`text-3xl w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${emoji === e ? "ring-4 ring-primary scale-110" : "bg-secondary"}`}
                    >{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">צבע</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-10 h-10 rounded-full transition-all ${color === c ? "ring-4 ring-primary scale-110" : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addChild} disabled={!name.trim()}>שמירה</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {children.length === 0 ? (
        <Card className="p-10 text-center bg-card/60">
          <div className="text-6xl mb-3">👶</div>
          <p className="text-muted-foreground">עדיין אין ילדים. הוסיפו ילד כדי להתחיל!</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((c) => (
            <Card key={c.id} className="p-5 shadow-card hover:shadow-pop transition-all relative group">
              <button
                onClick={() => removeChild(c.id)}
                className="absolute top-2 left-2 p-1.5 rounded-lg bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-soft"
                  style={{ backgroundColor: c.avatar_color }}
                >
                  {c.avatar_emoji}
                </div>
                <div>
                  <h3 className="text-xl font-bold">{c.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {todayCounts[c.id] ? `${todayCounts[c.id]} פריטים נבחרו היום ✓` : "טרם בחר היום"}
                  </p>
                </div>
              </div>
              <Link to="/app/kids" search={{ child: c.id } as never}>
                <Button className="w-full rounded-xl" variant={todayCounts[c.id] ? "secondary" : "default"}>
                  {todayCounts[c.id] ? "צפייה בקופסה" : "התחילו לבחור"}
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
