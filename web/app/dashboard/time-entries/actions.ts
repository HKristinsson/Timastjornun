"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function approveEntry(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_time_entry", {
    p_time_entry_id: id,
    p_decision: "approved",
    p_reason: null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/time-entries");
}

export async function rejectEntry(id: string, reason: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_time_entry", {
    p_time_entry_id: id,
    p_decision: "rejected",
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/time-entries");
}
