import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Row {
  employee_no: string;
  employee_name: string;
  worked_hours: number | null;
}

interface Summary {
  employee_no: string;
  employee_name: string;
  hours: number;
}

async function getSummary(from?: string, to?: string): Promise<Summary[]> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("v_time_entries")
      .select("employee_no, employee_name, worked_hours")
      .eq("status", "approved");
    if (from) q = q.gte("check_in_at", from);
    if (to) q = q.lte("check_in_at", `${to}T23:59:59`);
    const { data } = await q;
    const rows = (data ?? []) as Row[];

    const map = new Map<string, Summary>();
    for (const r of rows) {
      const cur = map.get(r.employee_no) ?? {
        employee_no: r.employee_no,
        employee_name: r.employee_name,
        hours: 0,
      };
      cur.hours += r.worked_hours ?? 0;
      map.set(r.employee_no, cur);
    }
    return [...map.values()].sort((a, b) => a.employee_name.localeCompare(b.employee_name, "is"));
  } catch {
    return [];
  }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const summary = await getSummary(sp.from, sp.to);
  const total = summary.reduce((s, r) => s + r.hours, 0);

  const exportParams = new URLSearchParams({ status: "approved" });
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Skýrslur — per starfsmaður</h1>
        <a
          href={`/api/export?${exportParams.toString()}`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          ⬇ Excel (samþykktir tímar)
        </a>
      </div>

      <form className="flex items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Frá</label>
          <input type="date" name="from" defaultValue={sp.from} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Til</label>
          <input type="date" name="to" defaultValue={sp.to} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Uppfæra
        </button>
      </form>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Starfsm.nr</th>
              <th className="px-4 py-3">Nafn</th>
              <th className="px-4 py-3 text-right">Klst (samþykkt)</th>
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  Engin samþykkt gögn (eða Supabase ekki tengt).
                </td>
              </tr>
            ) : (
              <>
                {summary.map((r) => (
                  <tr key={r.employee_no} className="border-t border-slate-100">
                    <td className="px-4 py-3">{r.employee_no}</td>
                    <td className="px-4 py-3">{r.employee_name}</td>
                    <td className="px-4 py-3 text-right">{Math.round(r.hours * 100) / 100}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="px-4 py-3" colSpan={2}>Samtals</td>
                  <td className="px-4 py-3 text-right">{Math.round(total * 100) / 100}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
