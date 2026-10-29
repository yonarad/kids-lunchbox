import { supabase } from "@/integrations/supabase/client";

export async function fillWeeklySchedules(householdId: string) {
  const { error } = await supabase.rpc("fill_weekly_schedules", { _household_id: householdId });
  if (error) throw error;
}