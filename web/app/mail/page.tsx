"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listInbox } from "@/lib/mail/service";
import type { InboundEmail } from "@/lib/mail/types";
import { Avatar, niceDate, TestBadge } from "./ui";

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

  const unread = emails.filter((e) => !e.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Innhólf</h1>
        {unread > 0 && (
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
            {unread} ólesin
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-white/70" />
          ))}
        </div>
      ) : emails.length === 0 ? (
        <div className="rounded-2xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-slate-200/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marketing/empty-inbox.png"
            alt=""
            className="mx-auto w-44"
          />
          <p className="mt-2 font-semibold text-slate-700">Innhólfið er tómt</p>
          <p className="mx-auto mt-1 max-w-[240px] text-sm text-slate-500">
            Póstur sem berst á netfangið þitt birtist hér.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
          {emails.map((e, i) => (
            <Link
              key={e.id}
              href={`/mail/${e.id}`}
              className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100 ${
                i > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <div className="relative">
                <Avatar name={e.sender_name || e.sender_email} />
                {!e.read_at && (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-brand" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={`truncate text-[15px] ${
                      e.read_at ? "text-slate-600" : "font-semibold text-slate-900"
                    }`}
                  >
                    {e.sender_name || e.sender_email}
                  </p>
                  <p className="shrink-0 text-xs tabular-nums text-slate-400">
                    {niceDate(e.received_at)}
                  </p>
                </div>
                <p
                  className={`truncate text-sm ${
                    e.read_at ? "text-slate-400" : "text-slate-700"
                  }`}
                >
                  {e.subject || "(ekkert efni)"}
                </p>
                {e.is_test && (
                  <div className="mt-1">
                    <TestBadge />
                  </div>
                )}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
