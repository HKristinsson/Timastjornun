"use client";

// Umsjón ofurnotenda alls kerfisins (aðeins super admin):
// listi, stofna nýjan, breyta lykilorði, eyða — varnir í bakenda
// (aldrei sjálfum sér, aldrei síðasta ofurnotandanum).
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface SuperUser {
  user_id: string;
  email: string;
  company: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] outline-none focus:border-brand focus:bg-white";

function translateError(msg: string): string {
  if (msg.includes("EMAIL_EXISTS")) return "Netfangið er þegar í notkun.";
  if (msg.includes("WEAK_PASSWORD")) return "Lykilorð þarf a.m.k. 8 stafi.";
  if (msg.includes("BAD_EMAIL")) return "Ógilt netfang.";
  if (msg.includes("SELF_DELETE")) return "Þú getur ekki eytt sjálfum þér.";
  if (msg.includes("LAST_SUPER"))
    return "Kerfið verður að hafa a.m.k. einn ofurnotanda.";
  if (msg.includes("FORBIDDEN")) return "Aðeins ofurnotendur hafa aðgang.";
  return msg;
}

export default function SupersPage() {
  const [supers, setSupers] = useState<SuperUser[]>([]);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Stofna nýjan
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Breyta lykilorði
  const [pwFor, setPwFor] = useState<SuperUser | null>(null);
  const [newPw, setNewPw] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data, error }, { data: session }] = await Promise.all([
      supabase.rpc("su_supers"),
      supabase.auth.getUser(),
    ]);
    if (error) setError(translateError(error.message));
    else setSupers((data ?? []) as SuperUser[]);
    setMyEmail(session.user?.email ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error } = await createClient().rpc("su_create_super", {
      p_email: email.trim(),
      p_password: password,
    });
    setBusy(false);
    if (error) {
      setError(translateError(error.message));
      return;
    }
    setNotice(`Ofurnotandinn ${email.trim()} var stofnaður.`);
    setEmail("");
    setPassword("");
    setShowCreate(false);
    load();
  }

  async function changePassword() {
    if (!pwFor) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error } = await createClient().rpc("su_set_super_password", {
      p_user_id: pwFor.user_id,
      p_password: newPw,
    });
    setBusy(false);
    if (error) {
      setError(translateError(error.message));
      return;
    }
    setNotice(`Lykilorði ${pwFor.email} var breytt.`);
    setPwFor(null);
    setNewPw("");
  }

  async function remove(s: SuperUser) {
    if (
      !window.confirm(
        `Eyða ofurnotandanum ${s.email}? Innskráning hans hættir að virka.`
      )
    )
      return;
    setError(null);
    const { error } = await createClient().rpc("su_delete_super", {
      p_user_id: s.user_id,
    });
    if (error) {
      setError(translateError(error.message));
      return;
    }
    setNotice(`${s.email} var eytt.`);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ofurnotendur</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ofurnotendur hafa full réttindi yfir öllu kerfinu: stofna og stýra
          félögum, vinna sem hvaða félag sem er og sýsla með aðra ofurnotendur.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white/70" />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
          {supers.map((s, i) => (
            <div
              key={s.user_id}
              className={`flex items-center gap-3 px-5 py-4 ${
                i > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-lg">
                🦸
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">
                  {s.email}
                  {s.email === myEmail && (
                    <span className="ml-2 rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                      Þú
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  {s.company ?? "—"} · Stofnað{" "}
                  {new Date(s.created_at).toLocaleDateString("is-IS")}
                  {s.last_sign_in_at &&
                    ` · Síðast inn ${new Date(s.last_sign_in_at).toLocaleDateString("is-IS")}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setPwFor(s);
                  setNewPw("");
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                Lykilorð
              </button>
              {s.email !== myEmail && (
                <button
                  onClick={() => remove(s)}
                  aria-label={`Eyða ${s.email}`}
                  className="p-1.5 text-red-500 hover:text-red-700"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Breyta lykilorði */}
      {pwFor && (
        <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
          <p className="text-sm font-semibold text-slate-700">
            Nýtt lykilorð fyrir {pwFor.email}
          </p>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="A.m.k. 8 stafir"
            className={field}
          />
          <div className="flex gap-2">
            <button
              onClick={changePassword}
              disabled={busy || newPw.length < 8}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? "Vista…" : "Vista lykilorð"}
            </button>
            <button
              onClick={() => setPwFor(null)}
              className="rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-600"
            >
              Hætta við
            </button>
          </div>
        </div>
      )}

      {/* Stofna nýjan */}
      {showCreate ? (
        <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
          <p className="text-sm font-semibold text-slate-700">Nýr ofurnotandi</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="netfang@daemi.is"
            className={field}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Lykilorð (a.m.k. 8 stafir)"
            className={field}
          />
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy || !email.includes("@") || password.length < 8}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? "Stofna…" : "Stofna ofurnotanda"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-600"
            >
              Hætta við
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 py-4 font-semibold text-slate-500 transition-colors hover:border-brand hover:text-brand"
        >
          + Stofna nýjan ofurnotanda
        </button>
      )}
    </div>
  );
}
