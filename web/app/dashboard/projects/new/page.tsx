import { createClient } from "@/lib/supabase/server";
import ProjectForm, { type ManagerOption } from "@/components/ProjectForm";
import { createProject } from "../actions";

export const dynamic = "force-dynamic";

async function getManagers(): Promise<ManagerOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("users").select("id, email");
    return (data ?? []) as ManagerOption[];
  } catch {
    return [];
  }
}

export default async function NewProjectPage() {
  const managers = await getManagers();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Nýtt verkefni</h1>
      <ProjectForm action={createProject} managers={managers} />
    </div>
  );
}
