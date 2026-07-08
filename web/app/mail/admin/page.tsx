"use client";

import { useCallback, useEffect, useState } from "react";
import { listRecipients, upsertRecipient, setRecipientActive } from "@/lib/mail/service";
import type { Group2Recipient } from "@/lib/mail/types";
import { Avatar, EmptyState } from "../ui";

export default function MailAdminPage() {
  const [recipients, setRecipients] = useState<Group2Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listRecipients()
      .then(setRecipients)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function add() {
    setError(null);
    setBusy(true);
    try {
      await upsertRecipient(email.trim().toLowerCase());
      setEmail("");
      load();
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("FORBIDDEN")
          ? "Aðeins kerfisstjóri getur breytt móttakendum."
          : e instanceof Error
          ? e.message
          : "Villa."
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: Group2Recipient) {
    await setRecipientActive(r.id, !r.active).catch(() => {});
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Móttakendur</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Netföng sem taka við pósti í appinu (hópur 2). Öll önnur netföng á léninu
          beinast áfram á Microsoft 365.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          Nýtt netfang
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="starfsmadur@reir.is"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] outline-none focus:border-brand focus:bg-white"
          />
          <button
            onClick={add}
            disabled={busy || !email.includes("@")}
            className="rounded-xl bg-brand px-4 py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            Bæta við
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-20 animate-pulse rounded-2xl bg-white/70" />
      ) : recipients.length === 0 ? (
        <EmptyState
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </svg>
          }
          title="Engir móttakendur skráðir"
          text="Bættu við fyrsta netfanginu hér að ofan."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
          {recipients.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-slate-100" : ""}`}
            >
              <Avatar name={r.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-slate-800">{r.email}</p>
                <p className={`text-xs font-medium ${r.active ? "text-emerald-600" : "text-slate-400"}`}>
                  {r.active ? "Virkur" : "Óvirkur"}
                </p>
              </div>
              {/* Rofi */}
              <button
                onClick={() => toggle(r)}
                role="switch"
                aria-checked={r.active}
                aria-label={`${r.active ? "Afvirkja" : "Virkja"} ${r.email}`}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  r.active ? "bg-brand" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                    r.active ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
