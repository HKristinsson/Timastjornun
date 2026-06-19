import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface EmployeeRow {
  id: string;
  full_name: string;
  employee_no: string;
  phone: string | null;
  status: string;
}

async function getEmployees(): Promise<EmployeeRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, employee_no, phone, status")
      .order("full_name", { ascending: true });
    return (data ?? []) as EmployeeRow[];
  } catch {
    return [];
  }
}

export default async function EmployeesPage() {
  const employees = await getEmployees();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Starfsmenn</h1>
        <Link
          href="/dashboard/employees/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nýr starfsmaður
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Nafn</th>
              <th className="px-4 py-3">Starfsm.nr</th>
              <th className="px-4 py-3">Sími</th>
              <th className="px-4 py-3">Staða</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Engir starfsmenn (eða Supabase ekki tengt).
                </td>
              </tr>
            ) : (
              employees.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{e.full_name}</td>
                  <td className="px-4 py-3">{e.employee_no}</td>
                  <td className="px-4 py-3 text-slate-600">{e.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={e.status === "active" ? "text-green-600" : "text-slate-400"}>
                      {e.status === "active" ? "⬤ Virkur" : "◯ Óvirkur"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/employees/${e.id}`} className="text-brand hover:underline">
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
