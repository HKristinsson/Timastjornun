"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Check {
  label: string;
  ok: boolean | null;
  note: string;
}

export default function MailSettingsPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getUser();
      setUserEmail(session.user?.email ?? null);

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
        note: error ? error.message : "OK",
      });

      const { error: whErr } = await fetch("/api/mail/inbound", { method: "POST", body: new FormData() })
        .then(async (r) => ({ error: r.status === 503 ? "Webhook óvirkur (vantar service key)" : null }))
        .catch(() => ({ error: "Náðist ekki í webhook" }));
      results.push({
        label: "Inbound webhook (/api/mail/inbound)",
        ok: whErr === null,
        note: whErr ?? "Svarar (hafnar óundirrituðu — rétt hegðun)",
      });

      setChecks(results);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stillingar</h1>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Innskráð(ur) sem</p>
        <p className="font-medium">{userEmail ?? "—"}</p>
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <p className="mb-2 font-semibold">Kerfisstaða</p>
        {checks.length === 0 ? (
          <p className="text-slate-400">Athuga…</p>
        ) : (
          checks.map((c) => (
            <div key={c.label} className="flex items-start gap-2 py-1">
              <span>{c.ok ? "✅" : "⚠️"}</span>
              <div>
                <p className="text-sm font-medium">{c.label}</p>
                <p className="break-all text-xs text-slate-500">{c.note}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-center text-xs text-slate-400">
        Uppsetning póstveitu (Mailgun) og beining á Microsoft 365: sjá MAILGATEWAY.md í
        verkefninu.
      </p>
    </div>
  );
}
