"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Company {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  created_at: string;
}

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("su_list_companies");
    if (error) {
      setAllowed(false);
      return;
    }
    setAllowed(true);
    setCompanies((data ?? []) as Company[]);
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
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("EMAIL_EXISTS")
          ? "Netfang admin er þegar í notkun."
          : error.message.includes("WEAK_PASSWORD")
          ? "Lykilorð verður að vera a.m.k. 6 stafir."
          : error.message
      );
      return;
    }
    setNotice(`Félagið „${name.trim()}" stofnað — admin: ${adminEmail.trim()}`);
    setName("");
    setDomain("");
    setAdminEmail("");
    setAdminPassword("");
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
      <h1 className="text-xl font-semibold">Félög</h1>

      <div className="max-w-xl space-y-4 rounded-xl bg-white p-6 shadow-sm">
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
        </div>
        <p className="text-xs text-slate-500">
          Starfsmenn félagsins geta aðeins fengið netföng á léni þess.
        </p>
        <button
          onClick={create}
          disabled={busy || !name.trim() || !adminEmail.includes("@") || adminPassword.length < 6}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Stofna…" : "Stofna félag"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Félag</th>
              <th className="px-4 py-3">Lén</th>
              <th className="px-4 py-3">Staða</th>
              <th className="px-4 py-3">Stofnað</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-slate-600">{c.domain ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={c.status === "active" ? "text-green-600" : "text-slate-400"}>
                    {c.status === "active" ? "⬤ Virkt" : "◯ Óvirkt"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(c.created_at).toLocaleDateString("is-IS")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
