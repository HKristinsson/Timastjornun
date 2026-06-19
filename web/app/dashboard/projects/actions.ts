"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_project", {
    p_project_no: str(formData.get("project_no")),
    p_name: str(formData.get("name")),
    p_description: str(formData.get("description")),
    p_address: str(formData.get("address")),
    p_manager_user_id: str(formData.get("manager_user_id")),
    p_start_date: str(formData.get("start_date")),
    p_end_date: str(formData.get("planned_end_date")),
    p_lat: num(formData.get("lat")),
    p_lng: num(formData.get("lng")),
    p_radius_m: num(formData.get("radius_m")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/projects");
  redirect("/dashboard/projects");
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_project", {
    p_id: id,
    p_name: str(formData.get("name")),
    p_description: str(formData.get("description")),
    p_address: str(formData.get("address")),
    p_manager_user_id: str(formData.get("manager_user_id")),
    p_start_date: str(formData.get("start_date")),
    p_end_date: str(formData.get("planned_end_date")),
    p_status: str(formData.get("status")),
    p_lat: num(formData.get("lat")),
    p_lng: num(formData.get("lng")),
    p_radius_m: num(formData.get("radius_m")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/projects");
  redirect("/dashboard/projects");
}
