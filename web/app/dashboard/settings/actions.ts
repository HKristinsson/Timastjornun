"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const KEYS = [
  "gps_poll_interval_sec",
  "min_accuracy_m",
  "grace_period_min",
  "gps_lost_timeout_min",
  "default_radius_m",
  "location_log_retention_days",
];

export async function saveSettings(formData: FormData) {
  const supabase = await createClient();
  for (const key of KEYS) {
    const raw = formData.get(key);
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const { error } = await supabase.rpc("set_company_setting", {
      p_key: key,
      p_value: value,
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/dashboard/settings");
}
