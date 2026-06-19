import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ProjectRow {
  id: string;
  project_no: string;
  name: string;
  address: string | null;
  status: string;
  radius_m: number | null;
}

async function getProjects(): Promise<ProjectRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("v_projects")
      .select("id, project_no, name, address, status, radius_m")
      .order("project_no", { ascending: true });
    return (data ?? []) as ProjectRow[];
  } catch {
    return [];
  }
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Verkefni</h1>
        <Link
          href="/dashboard/projects/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nýtt verkefni
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Nr.</th>
              <th className="px-4 py-3">Nafn</th>
              <th className="px-4 py-3">Heimilisfang</th>
              <th className="px-4 py-3">Radíus</th>
              <th className="px-4 py-3">Staða</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Engin verkefni (eða Supabase ekki tengt).
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{p.project_no}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">{p.address ?? "—"}</td>
                  <td className="px-4 py-3">{p.radius_m ? `${p.radius_m} m` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={p.status === "active" ? "text-green-600" : "text-slate-400"}>
                      {p.status === "active" ? "⬤ Virkt" : "◯ Óvirkt"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/projects/${p.id}`}
                      className="text-brand hover:underline"
                    >
                      Breyta
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
