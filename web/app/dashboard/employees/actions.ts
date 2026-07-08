"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EmployeeFormState = { error: string } | null;

function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

function translateEmpError(msg: string): string {
  if (msg.includes("EMAIL_EXISTS")) return "Netfangið er þegar í notkun (hjá öðrum notanda).";
  if (msg.includes("WEAK_PASSWORD")) return "Lykilorð verður að vera a.m.k. 6 stafir.";
  if (msg.includes("EMAIL_REQUIRED"))
    return "Netfang vantar á starfsmanninn — það er nauðsynlegt til að búa til innskráningu. Skráðu netfang og reyndu aftur.";
  if (msg.includes("NOT_FOUND")) return "Starfsmaður fannst ekki.";
  if (msg.includes("FORBIDDEN")) return "Þú hefur ekki heimild til þessarar aðgerðar.";
  if (msg.includes("duplicate key") && msg.includes("employee_no"))
    return "Starfsmannanúmer er þegar í notkun.";
  if (msg.includes("DOMAIN_MISMATCH"))
    return msg.replace(/^.*DOMAIN_MISMATCH:\s*/, "");
  return msg;
}

// Skrá/afskrá netfang starfsmanns sem hóps-2 póstmóttakanda (innhólf í appinu).
async function syncMailInbox(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string | null,
  wantInbox: boolean
): Promise<string | null> {
  if (wantInbox) {
    if (!email) {
      return "Netfang þarf að vera skráð til að virkja innhólf í appinu.";
    }
    const { error } = await supabase.rpc("mail_upsert_recipient", {
      p_email: email.toLowerCase(),
      p_full_name: null,
    });
    if (error) return translateEmpError(error.message);
  } else if (email) {
    // Afvirkja ef til (engin villa þótt móttakandi sé ekki til)
    await supabase.rpc("mail_set_recipient_active_by_email", {
      p_email: email.toLowerCase(),
      p_active: false,
    });
  }
  return null;
}

export async function createEmployee(
  _prev: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const supabase = await createClient();
  const password = str(formData.get("password"));

  // Ef lykilorð er gefið → stofna líka innskráningu (Auth-notanda)
  const { data, error } = password
    ? await supabase.rpc("create_employee_with_login", {
        p_full_name: str(formData.get("full_name")),
        p_employee_no: str(formData.get("employee_no")),
        p_phone: str(formData.get("phone")),
        p_email: str(formData.get("email")),
        p_national_id: str(formData.get("national_id")),
        p_password: password,
      })
    : await supabase.rpc("create_employee", {
        p_full_name: str(formData.get("full_name")),
        p_employee_no: str(formData.get("employee_no")),
        p_phone: str(formData.get("phone")),
        p_email: str(formData.get("email")),
        p_national_id: str(formData.get("national_id")),
      });
  if (error) return { error: translateEmpError(error.message) };

  // Úthluta verkefnum (checkbox-gildi 'project_ids')
  const projectIds = formData.getAll("project_ids").map((v) => v.toString());
  const employeeId = (data as { id: string } | null)?.id;
  if (employeeId && projectIds.length > 0) {
    await supabase.rpc("set_employee_projects", {
      p_employee_id: employeeId,
      p_project_ids: projectIds,
    });
  }

  // Innhólf í appinu (hópur 2)
  const mailErr = await syncMailInbox(
    supabase,
    str(formData.get("email")),
    formData.get("mail_inbox") != null
  );
  if (mailErr) return { error: mailErr };

  revalidatePath("/dashboard/employees");
  redirect("/dashboard/employees");
}

export async function updateEmployee(
  id: string,
  _prev: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_employee", {
    p_id: id,
    p_full_name: str(formData.get("full_name")),
    p_phone: str(formData.get("phone")),
    p_email: str(formData.get("email")),
    p_status: str(formData.get("status")),
  });
  if (error) return { error: translateEmpError(error.message) };

  // Ef lykilorð er gefið → setja/breyta innskráningu starfsmanns
  const password = str(formData.get("password"));
  if (password) {
    const { error: pwErr } = await supabase.rpc("set_employee_password", {
      p_employee_id: id,
      p_password: password,
    });
    if (pwErr) return { error: translateEmpError(pwErr.message) };
  }

  const projectIds = formData.getAll("project_ids").map((v) => v.toString());
  await supabase.rpc("set_employee_projects", {
    p_employee_id: id,
    p_project_ids: projectIds,
  });

  // Innhólf í appinu (hópur 2)
  const mailErr = await syncMailInbox(
    supabase,
    str(formData.get("email")),
    formData.get("mail_inbox") != null
  );
  if (mailErr) return { error: mailErr };

  revalidatePath("/dashboard/employees");
  redirect("/dashboard/employees");
}
