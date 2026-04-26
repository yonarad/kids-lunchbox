import { supabase } from "@/integrations/supabase/client";

export async function getMyHouseholdId(userId: string): Promise<string | null> {
  // Prefer a household the user was invited to (shared with them)
  const { data: member } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (member?.household_id) return member.household_id;

  // Or a household they own
  const { data: owned } = await supabase
    .from("households")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();
  if (owned?.id) return owned.id;

  // Or a household where they are linked as a child
  const { data: kid } = await supabase
    .from("children")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return kid?.household_id ?? null;
}

// Returns the child record if this user is linked as a child, else null
export async function getMyChildRecord(userId: string) {
  const { data } = await supabase
    .from("children")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export function todayInIsrael(resetHour: number = 0): string {
  // Compute the "target lunch day" in Israel time.
  // At resetHour (e.g. 12:00) we switch to selecting for the NEXT day.
  // Before resetHour: selecting for today. From resetHour onwards: selecting for tomorrow.
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  if (d.getHours() >= resetHour) {
    d.setDate(d.getDate() + 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getResetHour(householdId: string): Promise<number> {
  const { data } = await supabase
    .from("household_settings")
    .select("reset_hour")
    .eq("household_id", householdId)
    .maybeSingle();
  return data?.reset_hour ?? 12;
}
