import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getMyHouseholdId } from "@/lib/household";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  const [hid, setHid] = useState<string | null>(null);
  const [reminderHour, setReminderHour] = useState(20);
  const [emailNotif, setEmailNotif] = useState(true);
  const [morningHour, setMorningHour] = useState(5);
  const [resetHour, setResetHour] = useState(12);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const id = await getMyHouseholdId(user.id);
      setHid(id);
      if (!id) return;
      const { data } = await supabase.from("household_settings").select("*").eq("household_id", id).maybeSingle();
      if (data) {
        setReminderHour(data.reminder_hour);
        setEmailNotif(data.email_notifications);
        setMorningHour(data.morning_email_hour);
        setResetHour(data.reset_hour);
      }
    })();
  }, [user]);

  const save = async () => {
    if (!hid) return;
    const { error } = await supabase.from("household_settings").upsert({
      household_id: hid,
      reminder_hour: reminderHour,
      email_notifications: emailNotif,
      morning_email_hour: morningHour,
      reset_hour: resetHour,
    });
    if (error) toast.error(error.message);
    else toast.success("ההגדרות נשמרו ✓");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-bold">הגדרות ⚙️</h1>
        <p className="text-muted-foreground">התאמות אישיות ואוטומציות</p>
      </div>

      <Card className="p-5 shadow-card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-bold">סיכום במייל בבוקר</Label>
            <p className="text-xs text-muted-foreground">קבלו רשימת הכנה לפני שכולם קמים</p>
          </div>
          <Switch checked={emailNotif} onCheckedChange={setEmailNotif} />
        </div>

        <div>
          <Label>שעת שליחת המייל ({String(morningHour).padStart(2, "0")}:00)</Label>
          <Input type="range" min={4} max={9} value={morningHour} onChange={(e) => setMorningHour(Number(e.target.value))} />
        </div>

        <div>
          <Label>שעת תזכורת לבחירה בערב ({String(reminderHour).padStart(2, "0")}:00)</Label>
          <Input type="range" min={17} max={22} value={reminderHour} onChange={(e) => setReminderHour(Number(e.target.value))} />
        </div>

        <div>
          <Label>איפוס יומי של הבחירות ({String(resetHour).padStart(2, "0")}:00)</Label>
          <Input type="range" min={6} max={16} value={resetHour} onChange={(e) => setResetHour(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground mt-1">בשעה זו הבחירות נחשבות "ליום הבא"</p>
        </div>

        <Button onClick={save} className="w-full">שמירת הגדרות</Button>
      </Card>

      <Card className="p-5 shadow-card">
        <p className="text-sm font-medium mb-1">משתמש מחובר</p>
        <p className="text-sm text-muted-foreground mb-3">{user?.email}</p>
        <Button variant="outline" onClick={signOut}>יציאה מהחשבון</Button>
      </Card>

      <Card className="p-4 bg-sunny/30 border-sunny">
        <p className="text-sm">
          💡 <strong>טיפ:</strong> האוטומציות (שליחת מיילים בבוקר ותזכורות) פעילות אוטומטית עם השלמת ההגדרות.
        </p>
      </Card>
    </div>
  );
}
