"use client";

import { useCallback, useEffect, useState } from "react";
import { listRecipients, upsertRecipient, setRecipientActive } from "@/lib/mail/service";
import type { Group2Recipient } from "@/lib/mail/types";

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
      <h1 className="text-2xl font-bold">Hóps-2 móttakendur</h1>
      <p className="text-sm text-slate-500">
        Netföng sem taka við pósti í appinu í stað Microsoft 365. Öll önnur netföng á
        léninu beinast áfram á Microsoft (hópur 1).
      </p>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1 block text-sm font-medium">Nýtt netfang</label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="starfsmadur@reir.is"
            className="flex-1 rounded-xl border border-slate-300 p-3 text-sm"
          />
          <button
            onClick={add}
            disabled={busy || !email.includes("@")}
            className="rounded-xl bg-brand px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            + Bæta við
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Hleð…</p>
      ) : recipients.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-slate-700">Engir móttakendur skráðir</p>
          <p className="mt-1 text-sm text-slate-500">
            Bættu við fyrsta netfanginu hér að ofan.
          </p>
        </div>
      ) : (
        recipients.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"
          >
            <div>
              <p className="font-medium">{r.email}</p>
              <p className={`text-xs ${r.active ? "text-green-600" : "text-slate-400"}`}>
                {r.active ? "⬤ Virkur" : "◯ Óvirkur"}
              </p>
            </div>
            <button
              onClick={() => toggle(r)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
            >
              {r.active ? "Afvirkja" : "Virkja"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
