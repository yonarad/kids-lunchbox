import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Trash2, Crown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/family")({
  component: Family,
});

interface Member { id: string; user_id: string | null; invited_email: string | null; role: string }

function Family() {
  const { user } = useAuth();
  const [hid, setHid] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberEmails, setMemberEmails] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");

  const load = async () => {
    if (!user) return;
    const id = await getMyHouseholdId(user.id);
    setHid(id);
    if (!id) return;
    const { data: h } = await supabase.from("households").select("owner_id").eq("id", id).single();
    setIsOwner(h?.owner_id === user.id);
    const { data: ownerProf } = h?.owner_id ? await supabase.from("profiles").select("email").eq("id", h.owner_id).single() : { data: null };
    setOwnerEmail(ownerProf?.email ?? null);
    const { data: m } = await supabase.from("household_members").select("*").eq("household_id", id);
    setMembers(m ?? []);
    // resolve emails for linked members
    const ids = (m ?? []).map((x) => x.user_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,email").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p) => { map[p.id] = p.email ?? ""; });
      setMemberEmails(map);
    }
  };
  useEffect(() => { load(); }, [user]);

  const invite = async () => {
    if (!hid || !email.trim()) return;
    const e = email.trim().toLowerCase();
    // check if user exists already
    const { data: existing } = await supabase.from("profiles").select("id").eq("email", e).maybeSingle();
    const { error } = await supabase.from("household_members").insert({
      household_id: hid,
      user_id: existing?.id ?? null,
      invited_email: e,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(existing ? "ההורה נוסף!" : "ההזמנה נשמרה — ההורה יצטרף בעת ההתחברות הראשונה");
    setEmail(""); load();
  };

  const remove = async (id: string) => {
    if (!confirm("להסיר את ההורה?")) return;
    await supabase.from("household_members").delete().eq("id", id);
    load();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold">המשפחה 👨‍👩‍👧</h1>
        <p className="text-muted-foreground">נהלו מי יכול לעדכן את המזווה ולראות את הבחירות</p>
      </div>

      <Card className="p-5 shadow-card">
        <h2 className="font-bold mb-3 flex items-center gap-2"><Crown className="w-4 h-4 text-primary" /> בעל הבית</h2>
        <div className="bg-secondary/50 rounded-xl p-3">
          <p className="font-medium">{ownerEmail ?? "—"}</p>
          {isOwner && <p className="text-xs text-muted-foreground mt-1">זה אתם</p>}
        </div>
      </Card>

      <Card className="p-5 shadow-card">
        <h2 className="font-bold mb-3">הורים נוספים</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">עוד לא הזמנתם הורים נוספים.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between bg-secondary/50 rounded-xl p-3">
                <div>
                  <p className="font-medium">{m.user_id ? memberEmails[m.user_id] ?? "—" : m.invited_email}</p>
                  <p className="text-xs text-muted-foreground">{m.user_id ? "מחובר" : "מוזמן — יצטרף בעת התחברות"}</p>
                </div>
                {isOwner && (
                  <Button variant="ghost" size="sm" onClick={() => remove(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isOwner && (
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
            />
            <Button onClick={invite} disabled={!email.trim()}><Mail className="w-4 h-4 ml-1" /> הזמנה</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
