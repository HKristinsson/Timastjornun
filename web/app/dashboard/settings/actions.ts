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

// "HH:MM" -> mínútur frá miðnætti
function timeToMinutes(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || !/^\d{2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(":").map(Number);
  return h * 60 + m;
}

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

  // Tímagluggi staðsetningarvöktunar
  const start = timeToMinutes(formData.get("tracking_start"));
  const end = timeToMinutes(formData.get("tracking_end"));
  const weekends = formData.get("tracking_weekends") ? 1 : 0;
  const tracking: [string, number | null][] = [
    ["tracking_start_min", start],
    ["tracking_end_min", end],
    ["tracking_weekends", weekends],
  ];
  for (const [key, value] of tracking) {
    if (value == null) continue;
    const { error } = await supabase.rpc("set_company_setting", {
      p_key: key,
      p_value: value,
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/dashboard/settings");
}
