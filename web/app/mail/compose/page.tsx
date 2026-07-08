"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmail } from "@/lib/mail/service";

const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[15px] outline-none focus:border-brand focus:bg-white";

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
      <h1 className="text-[22px] font-bold tracking-tight">Nýtt skeyti</h1>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Til</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="netfang@daemi.is"
            className={field}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Efni</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Skeyti</label>
          <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} className={field} />
        </div>
        <button
          onClick={send}
          disabled={busy || !to.trim() || !body.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13 M22 2 15 22l-4-9-9-4z" />
          </svg>
          {busy ? "Sendi…" : "Senda"}
        </button>
      </div>

      <p className="text-center text-xs text-slate-400">
        Prófunarútgáfa: skeyti vistast sem send — póstveita verður tengd fyrir
        raunverulega útsendingu.
      </p>
    </div>
  );
}
