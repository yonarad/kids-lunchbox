import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId, todayInIsrael, getResetHour } from "@/lib/household";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

const COLORS = ["#FFB6C1", "#FFD93D", "#90EE90", "#87CEEB", "#FFA07A", "#DDA0DD"];
const EMOJIS = ["🙂", "😊", "🥰", "😎", "🦄", "🐯", "🐰", "🐼", "🦊", "🐸"];

interface Child {
  id: string;
  name: string;
  avatar_color: string;
  avatar_emoji: string;
  email: string | null;
  user_id: string | null;
}

function Dashboard() {
  const { user } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
    setChildren((kids ?? []) as Child[]);
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

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setEmail("");
    setColor(COLORS[0]);
    setEmoji(EMOJIS[0]);
  };

  const openAdd = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (c: Child) => {
    setEditingId(c.id);
    setName(c.name);
    setEmail(c.email ?? "");
    setColor(c.avatar_color);
    setEmoji(c.avatar_emoji);
    setOpen(true);
  };

  const saveChild = async () => {
    if (!householdId || !name.trim()) return;
    const cleanEmail = email.trim().toLowerCase() || null;

    if (editingId) {
      const { error } = await supabase
        .from("children")
        .update({
          name: name.trim(),
          avatar_color: color,
          avatar_emoji: emoji,
          email: cleanEmail,
        })
        .eq("id", editingId);
      if (error) {
        if (error.code === "23505") toast.error("המייל הזה כבר משויך לילד אחר");
        else toast.error("שגיאה: " + error.message);
        return;
      }
      // If the email matches an existing user, link them now
      if (cleanEmail) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", cleanEmail)
          .maybeSingle();
        if (prof?.id) {
          await supabase.from("children").update({ user_id: prof.id }).eq("id", editingId);
        }
      }
      toast.success("עודכן בהצלחה ✨");
    } else {
      const { data: inserted, error } = await supabase
        .from("children")
        .insert({
          household_id: householdId,
          name: name.trim(),
          avatar_color: color,
          avatar_emoji: emoji,
          email: cleanEmail,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") toast.error("המייל הזה כבר משויך לילד אחר");
        else toast.error("שגיאה: " + error.message);
        return;
      }
      // Try linking to existing user with that email
      if (cleanEmail && inserted) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", cleanEmail)
          .maybeSingle();
        if (prof?.id) {
          await supabase.from("children").update({ user_id: prof.id }).eq("id", inserted.id);
        }
      }
      toast.success("נוסף ילד חדש 🎉");
    }
    setOpen(false);
    resetForm();
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
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl" onClick={openAdd}><Plus className="w-4 h-4 ml-1" /> הוספת ילד</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "עריכת ילד" : "ילד חדש"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">שם</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: נועה" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> מייל (אופציונלי)
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="kid@gmail.com"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  אם תזינו מייל, הילד יוכל להתחבר עם חשבון Google שלו ולבחור את הקופסא בעצמו
                </p>
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
              <Button onClick={saveChild} disabled={!name.trim()}>שמירה</Button>
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
              <div className="absolute top-2 left-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(c)}
                  className="p-1.5 rounded-lg bg-secondary text-foreground"
                  aria-label="עריכה"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeChild(c.id)}
                  className="p-1.5 rounded-lg bg-destructive/10 text-destructive"
                  aria-label="מחיקה"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-4 mb-3">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-soft"
                  style={{ backgroundColor: c.avatar_color }}
                >
                  {c.avatar_emoji}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold">{c.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {todayCounts[c.id] ? `${todayCounts[c.id]} פריטים נבחרו היום ✓` : "טרם בחר היום"}
                  </p>
                </div>
              </div>
              {c.email && (
                <div className="mb-3 text-xs flex items-center gap-1.5 bg-secondary/50 rounded-lg px-2 py-1.5">
                  <Mail className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate" dir="ltr">{c.email}</span>
                  {c.user_id && <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </div>
              )}
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
