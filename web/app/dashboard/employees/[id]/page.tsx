import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EmployeeForm, {
  type ProjectOption,
  type EmployeeDefaults,
} from "@/components/EmployeeForm";
import { updateEmployee } from "../actions";

export const dynamic = "force-dynamic";

async function getData(id: string): Promise<{
  employee: EmployeeDefaults | null;
  projects: ProjectOption[];
}> {
  try {
    const supabase = await createClient();
    const [{ data: emp }, { data: projects }, { data: assigned }] = await Promise.all([
      supabase
        .from("employees")
        .select("full_name, employee_no, phone, email, status")
        .eq("id", id)
        .single(),
      supabase.from("projects").select("id, project_no, name").eq("status", "active").order("project_no"),
      supabase.from("employee_projects").select("project_id").eq("employee_id", id),
    ]);
    if (!emp) return { employee: null, projects: [] };
    const assignedIds = ((assigned ?? []) as { project_id: string }[]).map((a) => a.project_id);
    return {
      employee: { ...(emp as EmployeeDefaults), assignedProjectIds: assignedIds },
      projects: (projects ?? []) as ProjectOption[],
    };
  } catch {
    return { employee: null, projects: [] };
  }
}

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { employee, projects } = await getData(id);
  if (!employee) notFound();

  const action = updateEmployee.bind(null, id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Breyta starfsmanni</h1>
      <EmployeeForm action={action} projects={projects} defaults={employee} isEdit />
    </div>
  );
}
