"use client";

import { useEffect, useState } from "react";
import { listSent } from "@/lib/mail/service";
import type { OutboundEmail } from "@/lib/mail/types";

const STATUS: Record<string, string> = {
  queued: "Í bið",
  sent: "Sent",
  mock_sent: "Sent (prófun)",
  failed: "Mistókst",
};

export default function SentPage() {
  const [emails, setEmails] = useState<OutboundEmail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSent()
      .then(setEmails)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sent</h1>

      {loading ? (
        <p className="text-slate-400">Hleð…</p>
      ) : emails.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">📤</p>
          <p className="mt-2 font-medium text-slate-700">Engin send skeyti</p>
        </div>
      ) : (
        emails.map((e) => (
          <div key={e.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-medium">Til: {e.to_email}</p>
              <p className="shrink-0 text-xs text-slate-400">
                {new Date(e.created_at).toLocaleDateString("is-IS")}
              </p>
            </div>
            <p className="mt-0.5 truncate text-sm text-slate-600">
              {e.subject || "(ekkert efni)"}
            </p>
            <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {STATUS[e.status] ?? e.status}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
