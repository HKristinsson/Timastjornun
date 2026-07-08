"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listInbox, setStar } from "@/lib/mail/service";
import type { InboundEmail } from "@/lib/mail/types";
import { Avatar, niceDate, TestBadge } from "./ui";

type Filter = "all" | "unread" | "starred";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill={filled ? "#f59e0b" : "none"}
      stroke={filled ? "#f59e0b" : "#cbd5e1"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
    </svg>
  );
}

export default function InboxPage() {
  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => {
    listInbox()
      .then(setEmails)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const unread = emails.filter((e) => !e.read_at).length;
  const starredCount = emails.filter((e) => e.is_starred).length;

  const shown = useMemo(() => {
    let list = emails;
    if (filter === "unread") list = list.filter((e) => !e.read_at);
    if (filter === "starred") list = list.filter((e) => e.is_starred);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          (e.sender_name ?? "").toLowerCase().includes(q) ||
          e.sender_email.toLowerCase().includes(q) ||
          (e.subject ?? "").toLowerCase().includes(q) ||
          (e.body_text ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const d = new Date(a.received_at).getTime() - new Date(b.received_at).getTime();
      return newestFirst ? -d : d;
    });
  }, [emails, filter, query, newestFirst]);

  async function toggleStar(e: React.MouseEvent, email: InboundEmail) {
    e.preventDefault();
    e.stopPropagation();
    const next = !email.is_starred;
    setEmails((arr) =>
      arr.map((x) => (x.id === email.id ? { ...x, is_starred: next } : x))
    );
    await setStar(email.id, next).catch(() => {
      setEmails((arr) =>
        arr.map((x) => (x.id === email.id ? { ...x, is_starred: !next } : x))
      );
    });
  }

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "Allt" },
    { key: "unread", label: `Ólesið${unread ? ` (${unread})` : ""}` },
    { key: "starred", label: `★ Eftirlæti${starredCount ? ` (${starredCount})` : ""}` },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Innhólf</h1>
        <button
          onClick={() => setNewestFirst((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={newestFirst ? "M12 5v14 M19 12l-7 7-7-7" : "M12 19V5 M5 12l7-7 7 7"} />
          </svg>
          {newestFirst ? "Nýjast efst" : "Elst efst"}
        </button>
      </div>

      {/* Leit */}
      <div className="relative">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Leita í sendanda, efni eða texta…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-[15px] shadow-sm outline-none focus:border-brand"
        />
      </div>

      {/* Síuflipar */}
      <div className="flex gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 transition-colors ${
              filter === c.key
                ? "bg-brand text-white ring-brand"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {c.label}
          </button>
        ))}
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
      ) : shown.length === 0 ? (
        <div className="rounded-2xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-slate-200/60">
          {emails.length === 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/empty-inbox.png" alt="" className="mx-auto w-44" />
              <p className="mt-2 font-semibold text-slate-700">Innhólfið er tómt</p>
              <p className="mx-auto mt-1 max-w-[240px] text-sm text-slate-500">
                Póstur sem berst á netfangið þitt birtist hér.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-700">Ekkert fannst</p>
              <p className="mt-1 text-sm text-slate-500">
                Engin skeyti passa við leitina/síuna.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
          {shown.map((e, i) => (
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
              <button
                onClick={(ev) => toggleStar(ev, e)}
                aria-label={e.is_starred ? "Fjarlægja úr eftirlæti" : "Merkja sem eftirlæti"}
                className="shrink-0 p-1.5"
              >
                <Star filled={e.is_starred} />
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
