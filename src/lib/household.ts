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

  // Fall back to a household they own
  const { data: owned } = await supabase
    .from("households")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();
  return owned?.id ?? null;
}

export function todayInIsrael(): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
