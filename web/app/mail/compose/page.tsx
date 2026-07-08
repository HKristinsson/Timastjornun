"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmail } from "@/lib/mail/service";

export default function ComposePage() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      await sendEmail(to.trim(), subject.trim(), body.trim());
      router.push("/mail/sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Villa við sendingu.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nýtt skeyti</h1>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium">Til</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="netfang@daemi.is"
            className="w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Efni</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Skeyti</label>
          <textarea
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
        </div>
        <button
          onClick={send}
          disabled={busy || !to.trim() || !body.trim()}
          className="w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Sendi…" : "📤 Senda"}
        </button>
        <p className="text-center text-xs text-slate-400">
          MVP: skeyti eru vistuð sem send (mock) — póstveita verður tengd fyrir
          raunverulega útsendingu (sjá MAILGATEWAY.md).
        </p>
      </div>
    </div>
  );
}
