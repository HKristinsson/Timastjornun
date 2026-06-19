import { createClient } from "@/lib/supabase/server";
import ProjectsOverviewMap, { type MapProject } from "@/components/ProjectsOverviewMap";

export const dynamic = "force-dynamic";

async function getProjects(): Promise<MapProject[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("v_projects")
      .select("id, name, project_no, lat, lng, radius_m")
      .eq("status", "active");
    return (data ?? []) as MapProject[];
  } catch {
    return [];
  }
}

export default async function MapPage() {
  const projects = await getProjects();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Kort yfir verkefni</h1>
      {projects.length === 0 ? (
        <p className="text-sm text-slate-400">
          Engin virk verkefni með staðsetningu (eða Supabase ekki tengt).
        </p>
      ) : (
        <ProjectsOverviewMap projects={projects} />
      )}
    </div>
  );
}
