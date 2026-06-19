import { createClient } from "@/lib/supabase/server";
import EmployeeForm, { type ProjectOption } from "@/components/EmployeeForm";
import { createEmployee } from "../actions";

export const dynamic = "force-dynamic";

async function getProjects(): Promise<ProjectOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("projects")
      .select("id, project_no, name")
      .eq("status", "active")
      .order("project_no");
    return (data ?? []) as ProjectOption[];
  } catch {
    return [];
  }
}

export default async function NewEmployeePage() {
  const projects = await getProjects();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Nýr starfsmaður</h1>
      <EmployeeForm action={createEmployee} projects={projects} />
    </div>
  );
}
