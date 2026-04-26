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
  // Compute the "target lunch day" in Israel time using Intl parts (timezone-safe).
  // Before resetHour: today's date. From resetHour onwards: tomorrow's date.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = parseInt(get("year"));
  const m = parseInt(get("month"));
  const d = parseInt(get("day"));
  let hour = parseInt(get("hour"));
  // Intl can return "24" for midnight in some runtimes
  if (hour === 24) hour = 0;
  // Build a UTC date for the Israel calendar day, then optionally bump to tomorrow
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (hour >= resetHour) dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Format a YYYY-MM-DD date string as a Hebrew date without timezone shifts.
export function formatHebrewDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export async function getResetHour(householdId: string): Promise<number> {
  const { data } = await supabase
    .from("household_settings")
    .select("reset_hour")
    .eq("household_id", householdId)
    .maybeSingle();
  return data?.reset_hour ?? 12;
}
