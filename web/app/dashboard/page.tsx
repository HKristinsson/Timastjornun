import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Super admin án valins félags á heima á Félög-yfirlitinu
async function superWithoutCompany(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const [{ data: roles }, { data: acting }] = await Promise.all([
      supabase.rpc("my_roles"),
      supabase.rpc("su_acting_tenant"),
    ]);
    return (
      ((roles ?? []) as string[]).includes("super_admin") &&
      ((acting ?? []) as unknown[]).length === 0
    );
  } catch {
    return false;
  }
}

interface ActiveRow {
  id: string;
  employee_name: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
  inside_geofence: boolean | null;
}

interface SickRow {
  id: string;
  employee_name: string;
  date_from: string;
  date_to: string;
  note: string | null;
}

async function getData(): Promise<{
  active: ActiveRow[];
  activeProjects: number;
  pending: number;
  sickToday: SickRow[];
}> {
  try {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: active }, { count: activeProjects }, { count: pending }, { data: sick }] =
      await Promise.all([
        supabase
          .from("v_active_entries")
          .select("id, employee_name, project_name, project_no, check_in_at, inside_geofence")
          .order("check_in_at", { ascending: true }),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase
          .from("v_tenant_absences")
          .select("id, employee_name, date_from, date_to, note")
          .lte("date_from", today)
          .gte("date_to", today),
      ]);
    return {
      active: (active ?? []) as ActiveRow[],
      activeProjects: activeProjects ?? 0,
      pending: pending ?? 0,
      sickToday: (sick ?? []) as SickRow[],
    };
  } catch {
    return { active: [], activeProjects: 0, pending: 0, sickToday: [] };
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
  if (await superWithoutCompany()) {
    redirect("/dashboard/companies");
  }

  const { active, activeProjects, pending, sickToday } = await getData();
  const outside = active.filter((a) => a.inside_geofence === false).length;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Yfirlit</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <Stat label="Innskráðir núna" value={active.length} />
        <Stat label="Virk verkefni" value={activeProjects} />
        <Stat label="Utan svæðis" value={outside} />
        <Stat label="Tímar í bið" value={pending} />
        <Stat label="Veikir í dag" value={sickToday.length} />
      </div>

      {sickToday.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-2 text-sm font-semibold text-amber-800">
            🤒 Veikindi í dag
          </h2>
          <ul className="space-y-1 text-sm text-amber-900">
            {sickToday.map((s) => (
              <li key={s.id}>
                <span className="font-medium">{s.employee_name}</span>
                {s.date_from !== s.date_to &&
                  ` (til ${new Date(s.date_to + "T00:00:00").toLocaleDateString("is-IS")})`}
                {s.note && <span className="text-amber-700"> — {s.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

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
