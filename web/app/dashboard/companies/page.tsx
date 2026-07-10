"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  created_at: string;
  max_employees: number;
  active_employees: number;
  inactive_employees: number;
  active_projects: number;
  inactive_projects: number;
  admin_email: string | null;
}

interface CompanyEdit {
  id: string;
  name: string;
  domain: string;
  status: string;
  seats: string;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  employee_no: string;
  email: string | null;
  phone: string | null;
  status: string;
  has_login: boolean;
  mail_inbox: boolean;
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Record<string, EmployeeRow[]>>({});
  const [edit, setEdit] = useState<CompanyEdit | null>(null);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  async function toggleExpand(c: CompanyRow) {
    if (expanded === c.id) {
      setExpanded(null);
      return;
    }
    setExpanded(c.id);
    if (!employees[c.id]) {
      const { data } = await createClient().rpc("su_company_employees", {
        p_company: c.id,
      });
      setEmployees((m) => ({ ...m, [c.id]: (data ?? []) as EmployeeRow[] }));
    }
  }

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
      `Félagið „${name.trim()}" stofnað með ${seats} sætum — smelltu á „⚡ Vinna sem" til að stofna starfsmenn og verkefni fyrir það.`
    );
    setName("");
    setDomain("");
    setAdminEmail("");
    setAdminPassword("");
    setSeats("10");
    setShowCreate(false);
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

  async function saveEdit() {
    if (!edit) return;
    setEditErr(null);
    const { error } = await createClient().rpc("su_update_company", {
      p_id: edit.id,
      p_name: edit.name.trim(),
      p_domain: edit.domain.trim().toLowerCase() || null,
      p_status: edit.status,
      p_max_employees: parseInt(edit.seats, 10) || 1,
    });
    if (error) {
      setEditErr(
        error.message.includes("duplicate")
          ? "Lénið er þegar skráð á annað félag."
          : error.message.includes("BAD_SEATS")
          ? "Sætafjöldi verður að vera a.m.k. 1."
          : error.message
      );
      return;
    }
    setEdit(null);
    load();
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
        <h1 className="text-xl font-semibold">Félög — yfirlit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Félög greiða fyrir hvern starfsmann (sæti). Smelltu á félag til að sjá starfsmenn
          og netföng þess. „⚡ Vinna sem" beinir öllu stjórnborðinu að félaginu — þá
          stofnarðu starfsmenn, verkefni og staðsetningar fyrir það.
        </p>
      </div>

      {/* Heildartölfræði grunnsins */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-3xl font-semibold">{companies.length}</div>
          <div className="mt-1 text-sm text-slate-500">
            Félög í grunni ·{" "}
            <span className="text-green-600">
              {companies.filter((c) => c.status === "active").length} virk
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-3xl font-semibold">
            {companies.reduce((s, c) => s + c.active_employees, 0)}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Virkir notendur ·{" "}
            <span className="text-slate-400">
              {companies.reduce((s, c) => s + c.inactive_employees, 0)} óvirkir
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-3xl font-semibold">
            {companies.reduce((s, c) => s + c.active_projects, 0)}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Virk verkefni ·{" "}
            <span className="text-slate-400">
              {companies.reduce((s, c) => s + c.inactive_projects, 0)} óvirk
            </span>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-3xl font-semibold">
            {companies.reduce((s, c) => s + c.max_employees, 0)}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Seld sæti ·{" "}
            <span className="text-slate-400">
              {companies.reduce((s, c) => s + c.max_employees - c.active_employees, 0)} laus
            </span>
          </div>
        </div>
      </div>

      {/* Skjáborð: félög með útvíkkanlegum starfsmannalistum */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="w-8 px-2 py-3"></th>
              <th className="px-2 py-3">Félag</th>
              <th className="px-4 py-3">Lén</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Verkefni</th>
              <th className="px-4 py-3">Sætanýting</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const pct = Math.min(100, (c.active_employees / c.max_employees) * 100);
              const open = expanded === c.id;
              const emps = employees[c.id];
              return (
                <Fragment key={c.id}>
                  <tr
                    onClick={() => toggleExpand(c)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-2 py-3 text-center text-slate-400">
                      {open ? "▾" : "▸"}
                    </td>
                    <td className="px-2 py-3 font-medium">
                      {c.name}
                      {c.status !== "active" && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          Óvirkt
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.domain ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{c.admin_email ?? "—"}</td>
                    <td className="px-4 py-3">{c.active_projects}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                                pct >= 100
                                  ? "bg-red-500"
                                  : pct >= 80
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
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
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-2">
                        <button
                          onClick={() =>
                            setEdit({
                              id: c.id,
                              name: c.name,
                              domain: c.domain ?? "",
                              status: c.status,
                              seats: String(c.max_employees),
                            })
                          }
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand"
                        >
                          ✎ Breyta
                        </button>
                        <button
                          onClick={() => actAs(c)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand"
                        >
                          ⚡ Vinna sem
                        </button>
                      </span>
                    </td>
                  </tr>
                  {edit?.id === c.id && (
                    <tr className="border-t border-slate-100 bg-blue-50/40">
                      <td colSpan={7} className="px-6 py-4">
                        <p className="mb-3 text-sm font-semibold text-slate-700">
                          Breyta félagi: {c.name}
                        </p>
                        {editErr && (
                          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {editErr}
                          </p>
                        )}
                        <div className="grid max-w-3xl grid-cols-2 gap-3 lg:grid-cols-4">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">
                              Nafn
                            </label>
                            <input
                              value={edit.name}
                              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                              className={field}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">
                              Lén
                            </label>
                            <input
                              value={edit.domain}
                              onChange={(e) => setEdit({ ...edit, domain: e.target.value })}
                              className={field}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">
                              Sæti
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={edit.seats}
                              onChange={(e) => setEdit({ ...edit, seats: e.target.value })}
                              className={field}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">
                              Staða
                            </label>
                            <select
                              value={edit.status}
                              onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                              className={field}
                            >
                              <option value="active">Virkt</option>
                              <option value="suspended">Óvirkt</option>
                            </select>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={saveEdit}
                            disabled={!edit.name.trim()}
                            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                          >
                            Vista breytingar
                          </button>
                          <button
                            onClick={() => {
                              setEdit(null);
                              setEditErr(null);
                            }}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                          >
                            Hætta
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {open && (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={7} className="px-6 py-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Starfsmenn {c.name} ({emps?.length ?? "…"})
                        </p>
                        {!emps ? (
                          <p className="text-sm text-slate-400">Hleð…</p>
                        ) : emps.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            Engir starfsmenn — notaðu „⚡ Vinna sem" og stofnaðu þá undir
                            Starfsmenn.
                          </p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead className="text-left text-xs text-slate-400">
                              <tr>
                                <th className="py-1 pr-4">Nafn</th>
                                <th className="py-1 pr-4">Nr.</th>
                                <th className="py-1 pr-4">Netfang</th>
                                <th className="py-1 pr-4">Sími</th>
                                <th className="py-1 pr-4">Innskráning</th>
                                <th className="py-1 pr-4">Póstur í appi</th>
                                <th className="py-1">Staða</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emps.map((e) => (
                                <tr key={e.id} className="border-t border-slate-200/60">
                                  <td className="py-1.5 pr-4 font-medium">{e.full_name}</td>
                                  <td className="py-1.5 pr-4">{e.employee_no}</td>
                                  <td className="py-1.5 pr-4 text-slate-600">
                                    {e.email ?? "—"}
                                  </td>
                                  <td className="py-1.5 pr-4 text-slate-600">
                                    {e.phone ?? "—"}
                                  </td>
                                  <td className="py-1.5 pr-4">
                                    {e.has_login ? "✅" : "—"}
                                  </td>
                                  <td className="py-1.5 pr-4">
                                    {e.mail_inbox ? "📬 ✅" : "—"}
                                  </td>
                                  <td className="py-1.5">
                                    <span
                                      className={
                                        e.status === "active"
                                          ? "text-green-600"
                                          : "text-slate-400"
                                      }
                                    >
                                      {e.status === "active" ? "Virkur" : "Óvirkur"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stofna nýtt félag — fyrir neðan félagalistann */}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {!showCreate ? (
        <button
          onClick={() => {
            setShowCreate(true);
            setNotice(null);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white py-5 font-semibold text-slate-600 transition-colors hover:border-brand hover:text-brand"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14 M5 12h14" />
          </svg>
          Stofna nýtt félag
        </button>
      ) : (
        <div className="max-w-2xl space-y-4 rounded-xl bg-white p-6 shadow-sm ring-2 ring-brand/20">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Stofna nýtt félag</p>
            <button
              onClick={() => {
                setShowCreate(false);
                setError(null);
              }}
              className="text-sm text-slate-400 hover:text-slate-600"
            >
              ✕ Loka
            </button>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
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
      )}
    </div>
  );
}
