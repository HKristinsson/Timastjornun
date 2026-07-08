"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listInbox } from "@/lib/mail/service";
import type { InboundEmail } from "@/lib/mail/types";

export default function InboxPage() {
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInbox()
      .then(setEmails)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Innhólf</h1>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-400">Hleð…</p>
      ) : emails.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">📭</p>
          <p className="mt-2 font-medium text-slate-700">Innhólfið er tómt</p>
          <p className="mt-1 text-sm text-slate-500">
            Póstur sem berst á netfangið þitt birtist hér.
          </p>
        </div>
      ) : (
        emails.map((e) => (
          <Link
            key={e.id}
            href={`/mail/${e.id}`}
            className={`block rounded-2xl bg-white p-4 shadow-sm ${
              e.read_at ? "" : "border-l-4 border-brand"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`truncate ${e.read_at ? "text-slate-700" : "font-semibold"}`}>
                {e.sender_name || e.sender_email}
              </p>
              <p className="shrink-0 text-xs text-slate-400">
                {new Date(e.received_at).toLocaleDateString("is-IS")}
              </p>
            </div>
            <p className={`mt-0.5 truncate text-sm ${e.read_at ? "text-slate-500" : "text-slate-800"}`}>
              {e.subject || "(ekkert efni)"}
            </p>
            {e.is_test && (
              <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                PRÓFUNARGÖGN
              </span>
            )}
          </Link>
        ))
      )}
    </div>
  );
}
