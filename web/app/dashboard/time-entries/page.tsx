import { createClient } from "@/lib/supabase/server";
import ReviewActions from "@/components/ReviewActions";

export const dynamic = "force-dynamic";

interface EntryRow {
  id: string;
  employee_name: string;
  project_no: string;
  project_name: string;
  task_no: string | null;
  task_name: string | null;
  check_in_at: string;
  check_out_at: string | null;
  check_out_type: string | null;
  worked_hours: number | null;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Virk",
  pending: "Í bið",
  approved: "Samþykkt",
  rejected: "Hafnað",
};

async function getEntries(status: string, from?: string, to?: string): Promise<EntryRow[]> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("v_time_entries")
      .select(
        "id, employee_name, project_no, project_name, task_no, task_name, check_in_at, check_out_at, check_out_type, worked_hours, status"
      )
      .order("check_in_at", { ascending: false });
    if (status !== "all") q = q.eq("status", status);
    if (from) q = q.gte("check_in_at", from);
    if (to) q = q.lte("check_in_at", `${to}T23:59:59`);
    const { data } = await q;
    return (data ?? []) as EntryRow[];
  } catch {
    return [];
  }
}

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("is-IS", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TimeEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "pending";
  const entries = await getEntries(status, sp.from, sp.to);

  const exportParams = new URLSearchParams();
  if (status) exportParams.set("status", status);
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tímaskráningar</h1>
        <a
          href={`/api/export?${exportParams.toString()}`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          ⬇ Flytja út í Excel
        </a>
      </div>

      {/* Síur */}
      <form className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Staða</label>
          <select
            name="status"
            defaultValue={status}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">Allar</option>
            <option value="pending">Í bið</option>
            <option value="approved">Samþykktar</option>
            <option value="rejected">Hafnaðar</option>
            <option value="active">Virkar</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Frá</label>
          <input type="date" name="from" defaultValue={sp.from} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Til</label>
          <input type="date" name="to" defaultValue={sp.to} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Sía
        </button>
      </form>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Starfsm.</th>
              <th className="px-4 py-3">Verkefni</th>
              <th className="px-4 py-3">Inn</th>
              <th className="px-4 py-3">Út</th>
              <th className="px-4 py-3">Klst</th>
              <th className="px-4 py-3">Staða</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Engar skráningar (eða Supabase ekki tengt).
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{e.employee_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {e.project_no} {e.project_name}
                    {e.task_no && (
                      <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                        {e.task_no} {e.task_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{fmt(e.check_in_at)}</td>
                  <td className="px-4 py-3">
                    {fmt(e.check_out_at)}
                    {e.check_out_type?.startsWith("auto") && (
                      <span className="ml-1 text-amber-600" title={e.check_out_type}>⚠</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{e.worked_hours ?? "—"}</td>
                  <td className="px-4 py-3">{STATUS_LABELS[e.status] ?? e.status}</td>
                  <td className="px-4 py-3">
                    {e.status === "pending" ? <ReviewActions id={e.id} /> : null}
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
