"use client";

import { useEffect, useState } from "react";
import { listSent } from "@/lib/mail/service";
import type { OutboundEmail } from "@/lib/mail/types";
import { Avatar, niceDate, EmptyState } from "../ui";

const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "Í bið", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  sent: { label: "Sent", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  mock_sent: { label: "Sent (prófun)", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  failed: { label: "Mistókst", cls: "bg-red-50 text-red-700 ring-red-200" },
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
      <h1 className="text-[22px] font-bold tracking-tight">Sent</h1>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      ) : emails.length === 0 ? (
        <EmptyState
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13 M22 2 15 22l-4-9-9-4z" />
            </svg>
          }
          title="Engin send skeyti"
          text="Skeyti sem þú sendir birtast hér."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
          {emails.map((e, i) => {
            const s = STATUS[e.status] ?? STATUS.queued;
            return (
              <div
                key={e.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-slate-100" : ""}`}
              >
                <Avatar name={e.to_email} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-medium text-slate-800">
                      {e.to_email}
                    </p>
                    <p className="shrink-0 text-xs tabular-nums text-slate-400">
                      {niceDate(e.created_at)}
                    </p>
                  </div>
                  <p className="truncate text-sm text-slate-500">
                    {e.subject || "(ekkert efni)"}
                  </p>
                  <span
                    className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ${s.cls}`}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
