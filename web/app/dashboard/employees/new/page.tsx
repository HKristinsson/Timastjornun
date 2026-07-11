import { createClient } from "@/lib/supabase/server";
import EmployeeForm, { type ProjectOption } from "@/components/EmployeeForm";
import { createEmployee } from "../actions";

export const dynamic = "force-dynamic";

async function getData(): Promise<{ projects: ProjectOption[]; domain: string | null }> {
  try {
    const supabase = await createClient();
    const [{ data }, { data: domain }] = await Promise.all([
      supabase
        .from("projects")
        .select("id, project_no, name")
        .eq("status", "active")
        .order("project_no"),
      supabase.rpc("my_company_domain"),
    ]);
    return {
      projects: (data ?? []) as ProjectOption[],
      domain: (domain as string | null) ?? null,
    };
  } catch {
    return { projects: [], domain: null };
  }
}

export default async function NewEmployeePage() {
  const { projects, domain } = await getData();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Nýr starfsmaður</h1>
      <EmployeeForm action={createEmployee} projects={projects} domain={domain} />
    </div>
  );
}
