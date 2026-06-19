import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProjectForm, { type ManagerOption, type ProjectDefaults } from "@/components/ProjectForm";
import { updateProject } from "../actions";

export const dynamic = "force-dynamic";

async function getData(id: string): Promise<{
  project: ProjectDefaults | null;
  managers: ManagerOption[];
}> {
  try {
    const supabase = await createClient();
    const [{ data: project }, { data: managers }] = await Promise.all([
      supabase.from("v_projects").select("*").eq("id", id).single(),
      supabase.from("users").select("id, email"),
    ]);
    return {
      project: (project as ProjectDefaults) ?? null,
      managers: (managers ?? []) as ManagerOption[],
    };
  } catch {
    return { project: null, managers: [] };
  }
}

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project, managers } = await getData(id);
  if (!project) notFound();

  const action = updateProject.bind(null, id);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Breyta verkefni</h1>
      <ProjectForm action={action} managers={managers} defaults={project} isEdit />
    </div>
  );
}
