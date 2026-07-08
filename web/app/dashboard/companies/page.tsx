"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  created_at: string;
  max_employees: number;
  active_employees: number;
  admin_email: string | null;
}

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [seats, setSeats] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editSeats, setEditSeats] = useState<{ id: string; value: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("su_companies_overview");
    if (error) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    setCompanies((data ?? []) as CompanyRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error } = await createClient().rpc("create_company", {
      p_name: name.trim(),
      p_domain: domain.trim().toLowerCase() || null,
      p_admin_email: adminEmail.trim().toLowerCase(),
      p_admin_password: adminPassword,
      p_max_employees: parseInt(seats, 10) || 10,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("EMAIL_EXISTS")
          ? "Netfang admin er þegar í notkun."
          : error.message.includes("WEAK_PASSWORD")
          ? "Lykilorð verður að vera a.m.k. 6 stafir."
          : error.message.includes("BAD_SEATS")
          ? "Fjöldi starfsmanna verður að vera a.m.k. 1."
          : error.message
      );
      return;
    }
    setNotice(
      `Félagið „${name.trim()}" stofnað með ${seats} sætum — admin: ${adminEmail.trim()}`
    );
    setName("");
    setDomain("");
    setAdminEmail("");
    setAdminPassword("");
    setSeats("10");
    load();
  }

  async function saveSeats(id: string) {
    if (!editSeats) return;
    const n = parseInt(editSeats.value, 10);
    if (!n || n < 1) return;
    await createClient().rpc("su_set_max_employees", { p_company: id, p_max: n });
    setEditSeats(null);
    load();
  }

  async function actAs(c: CompanyRow) {
    await createClient().rpc("su_set_acting_tenant", { p_tenant: c.id });
    window.location.href = "/dashboard";
  }

  if (allowed === false) {
    return (
      <p className="text-slate-500">
        Aðeins yfirstjórnandi (super admin) hefur aðgang að þessari síðu.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Félög</h1>
        <p className="mt-1 text-sm text-slate-500">
          Félög greiða fyrir hvern starfsmann (sæti). Notaðu „Vinna sem" til að stofna
          starfsmenn og verkefni fyrir einstök félög.
        </p>
      </div>

      <div className="max-w-2xl space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <p className="font-semibold">Stofna nýtt félag</p>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Nafn félags</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Lén (t.d. reir.is)</label>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Netfang admin</label>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Lykilorð admin</label>
            <input
              type="text"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Fjöldi starfsmanna (sæti)
            </label>
            <input
              type="number"
              min={1}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-500">
              Greitt er fyrir hvert sæti — kerfið stöðvar stofnun umfram þau.
            </p>
          </div>
        </div>
        <button
          onClick={create}
          disabled={
            busy || !name.trim() || !adminEmail.includes("@") || adminPassword.length < 6
          }
          className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Stofna…" : "Stofna félag + admin"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Félag</th>
              <th className="px-4 py-3">Lén</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Sætanýting</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const pct = Math.min(100, (c.active_employees / c.max_employees) * 100);
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.domain ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.admin_email ?? "—"}</td>
                  <td className="px-4 py-3">
                    {editSeats?.id === c.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={editSeats.value}
                          onChange={(e) =>
                            setEditSeats({ id: c.id, value: e.target.value })
                          }
                          className="w-20 rounded border border-slate-300 px-2 py-1"
                        />
                        <button
                          onClick={() => saveSeats(c.id)}
                          className="rounded bg-brand px-2 py-1 text-xs font-semibold text-white"
                        >
                          Vista
                        </button>
                        <button
                          onClick={() => setEditSeats(null)}
                          className="text-xs text-slate-400"
                        >
                          Hætta
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          setEditSeats({ id: c.id, value: String(c.max_employees) })
                        }
                        title="Breyta sætafjölda"
                        className="group flex w-40 items-center gap-2"
                      >
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={`block h-full rounded-full ${
                              pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-emerald-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="text-xs font-semibold text-slate-600 group-hover:text-brand">
                          {c.active_employees}/{c.max_employees} ✎
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => actAs(c)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand"
                    >
                      ⚡ Vinna sem
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
