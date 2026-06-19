import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ActiveRow {
  id: string;
  employee_name: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
  inside_geofence: boolean | null;
}

async function getData(): Promise<{
  active: ActiveRow[];
  activeProjects: number;
  pending: number;
}> {
  try {
    const supabase = await createClient();
    const [{ data: active }, { count: activeProjects }, { count: pending }] =
      await Promise.all([
        supabase
          .from("v_active_entries")
          .select("id, employee_name, project_name, project_no, check_in_at, inside_geofence")
          .order("check_in_at", { ascending: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
    return {
      active: (active ?? []) as ActiveRow[],
      activeProjects: activeProjects ?? 0,
      pending: pending ?? 0,
    };
  } catch {
    return { active: [], activeProjects: 0, pending: 0 };
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const { active, activeProjects, pending } = await getData();
  const outside = active.filter((a) => a.inside_geofence === false).length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Yfirlit</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="Innskráðir núna" value={active.length} />
        <Stat label="Virk verkefni" value={activeProjects} />
        <Stat label="Utan svæðis" value={outside} />
        <Stat label="Tímar í bið" value={pending} />
      </div>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Innskráðir núna</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-400">
            Engar virkar skráningar (eða Supabase ekki tengt).
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="pb-2">Starfsmaður</th>
                <th className="pb-2">Verkefni</th>
                <th className="pb-2">Inn-tími</th>
                <th className="pb-2">Svæði</th>
              </tr>
            </thead>
            <tbody>
              {active.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2">{row.employee_name}</td>
                  <td className="py-2">
                    {row.project_no} {row.project_name}
                  </td>
                  <td className="py-2">
                    {new Date(row.check_in_at).toLocaleTimeString("is-IS", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2">
                    {row.inside_geofence === false ? (
                      <span className="text-amber-600">⚠ utan</span>
                    ) : row.inside_geofence === true ? (
                      <span className="text-green-600">✅ inni</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
