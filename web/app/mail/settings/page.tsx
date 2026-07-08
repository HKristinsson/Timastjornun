"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "../ui";

interface Check {
  label: string;
  ok: boolean | null;
  note: string;
}

export default function MailSettingsPage() {
  const router = useRouter();
  const [checks, setChecks] = useState<Check[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getUser();
      setUserEmail(session.user?.email ?? null);

      const { data: roles } = await supabase.rpc("my_roles");
      const r: string[] = roles ?? [];
      setIsManager(r.includes("admin") || r.includes("project_manager"));

      const results: Check[] = [];
      results.push({
        label: "Supabase tenging",
        ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        note: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "vantar",
      });

      const { error } = await supabase.from("v_my_inbox").select("id").limit(1);
      results.push({
        label: "Innhólfs-aðgangur (RLS)",
        ok: !error,
        note: error ? error.message : "Í lagi",
      });

      const wh = await fetch("/api/mail/inbound", { method: "POST", body: new FormData() })
        .then((r) => (r.status === 503 ? "Webhook óvirkur (vantar service key í Vercel)" : null))
        .catch(() => "Náðist ekki í webhook");
      results.push({
        label: "Inbound webhook",
        ok: wh === null,
        note: wh ?? "Svarar — hafnar óundirrituðum köllum (rétt hegðun)",
      });

      setChecks(results);
    })();
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold tracking-tight">Stillingar</h1>

      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
        <Avatar name={userEmail ?? "?"} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">Innskráð(ur) sem</p>
          <p className="truncate font-semibold text-slate-800">{userEmail ?? "—"}</p>
        </div>
      </div>

      <Link
        href={isManager ? "/dashboard" : "/me"}
        className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 transition-colors hover:bg-slate-50"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2" />
            </svg>
          </span>
          <span className="font-semibold text-slate-800">Opna tímaskráningu</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
        <p className="mb-3 font-semibold text-slate-800">Kerfisstaða</p>
        {checks.length === 0 ? (
          <p className="text-sm text-slate-400">Athuga…</p>
        ) : (
          <div className="space-y-3">
            {checks.map((c) => (
              <div key={c.label} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    c.ok ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">{c.label}</p>
                  <p className="break-all text-xs text-slate-400">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={signOut}
        className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 font-semibold text-red-600 shadow-sm transition-colors hover:bg-red-50"
      >
        Útskrá
      </button>

      <p className="text-center text-xs text-slate-400">
        Uppsetning póstveitu og beiningar: MAILGATEWAY.md í verkefninu.
      </p>
    </div>
  );
}
