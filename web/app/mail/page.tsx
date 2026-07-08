"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { listInbox, listSent, setStar } from "@/lib/mail/service";
import type { InboundEmail, OutboundEmail } from "@/lib/mail/types";
import { Avatar, niceDate, TestBadge } from "./ui";

type Box = "inbox" | "sent";
type Filter = "all" | "unread" | "starred";

const SENT_STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "Í bið", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  sent: { label: "Sent", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  mock_sent: { label: "Sent (prófun)", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  failed: { label: "Mistókst", cls: "bg-red-50 text-red-700 ring-red-200" },
};

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

export default function MailHub() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white/70" />}>
      <MailHubInner />
    </Suspense>
  );
}

function MailHubInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const box: Box = searchParams.get("box") === "sent" ? "sent" : "inbox";

  const [emails, setEmails] = useState<InboundEmail[]>([]);
  const [sent, setSent] = useState<OutboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => {
    Promise.all([listInbox(), listSent()])
      .then(([inn, ut]) => {
        setEmails(inn);
        setSent(ut);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const unread = emails.filter((e) => !e.read_at).length;
  const starredCount = emails.filter((e) => e.is_starred).length;

  const shownInbox = useMemo(() => {
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

  const shownSent = useMemo(() => {
    let list = sent;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.to_email.toLowerCase().includes(q) ||
          (e.subject ?? "").toLowerCase().includes(q) ||
          (e.body_text ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return newestFirst ? -d : d;
    });
  }, [sent, query, newestFirst]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Tölvupóstur</h1>
        <Link
          href="/mail/compose"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14 M5 12h14" />
          </svg>
          Nýr póstur
        </Link>
      </div>

      {/* Hólf: Innhólf | Úthólf */}
      <div className="flex rounded-xl bg-slate-200/70 p-1">
        {(
          [
            { key: "inbox", label: `Innhólf${unread ? ` (${unread})` : ""}` },
            { key: "sent", label: "Úthólf" },
          ] as { key: Box; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => router.replace(t.key === "sent" ? "/mail?box=sent" : "/mail")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              box === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Leit + röðun */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Leita…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-[15px] shadow-sm outline-none focus:border-brand"
          />
        </div>
        <button
          onClick={() => setNewestFirst((v) => !v)}
          aria-label="Snúa röðun"
          className="inline-flex items-center gap-1 rounded-xl bg-white px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={newestFirst ? "M12 5v14 M19 12l-7 7-7-7" : "M12 19V5 M5 12l7-7 7 7"} />
          </svg>
          {newestFirst ? "Nýjast" : "Elst"}
        </button>
      </div>

      {/* Síuflipar — aðeins í innhólfi */}
      {box === "inbox" && (
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
      )}

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
      ) : box === "inbox" ? (
        shownInbox.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-slate-200/60">
            {emails.length === 0 ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marketing/empty-inbox.png" alt="" className="mx-auto w-44" />
                <p className="mt-2 font-semibold text-slate-700">Innhólfið er tómt</p>
              </>
            ) : (
              <p className="font-semibold text-slate-700">Ekkert fannst</p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
            {shownInbox.map((e, i) => (
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
        )
      ) : shownSent.length === 0 ? (
        <div className="rounded-2xl bg-white px-6 py-10 text-center shadow-sm ring-1 ring-slate-200/60">
          <p className="font-semibold text-slate-700">
            {sent.length === 0 ? "Úthólfið er tómt" : "Ekkert fannst"}
          </p>
          {sent.length === 0 && (
            <p className="mt-1 text-sm text-slate-500">Skeyti sem þú sendir birtast hér.</p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
          {shownSent.map((e, i) => {
            const s = SENT_STATUS[e.status] ?? SENT_STATUS.queued;
            return (
              <Link
                key={e.id}
                href={`/mail/sent/${e.id}`}
                className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100 ${
                  i > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <Avatar name={e.to_email} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-medium text-slate-800">
                      Til: {e.to_email}
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
