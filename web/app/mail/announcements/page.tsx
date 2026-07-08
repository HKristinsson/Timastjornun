"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listMyAnnouncements,
  markAnnouncementRead,
  sendAnnouncement,
  listSentAnnouncements,
  announcementReaders,
  myMailAccess,
} from "@/lib/mail/service";
import type { Announcement, SentAnnouncement, AnnouncementReader } from "@/lib/mail/types";
import { niceDate } from "../ui";

const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] outline-none focus:border-brand focus:bg-white";

export default function AnnouncementsPage() {
  const [isManager, setIsManager] = useState(false);
  const [mine, setMine] = useState<Announcement[]>([]);
  const [sent, setSent] = useState<SentAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [openReaders, setOpenReaders] = useState<string | null>(null);
  const [readers, setReaders] = useState<AnnouncementReader[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(async () => {
    const access = await myMailAccess();
    setIsManager(access.isManager);
    const [m, s] = await Promise.all([
      listMyAnnouncements().catch(() => []),
      access.isManager ? listSentAnnouncements().catch(() => []) : Promise.resolve([]),
    ]);
    setMine(m);
    setSent(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    setBusy(true);
    try {
      await sendAnnouncement(title.trim(), body.trim());
      setTitle("");
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function markRead(id: string) {
    await markAnnouncementRead(id).catch(() => {});
    setMine((arr) =>
      arr.map((a) => (a.id === id ? { ...a, read_at: new Date().toISOString() } : a))
    );
  }

  async function showReaders(id: string) {
    if (openReaders === id) {
      setOpenReaders(null);
      return;
    }
    setReaders(await announcementReaders(id).catch(() => []));
    setOpenReaders(id);
  }

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-white/70" />;

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-bold tracking-tight">Tilkynningar</h1>

      {/* Stjórnandi: senda tilkynningu á alla starfsmenn */}
      {isManager && (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
          <p className="font-semibold text-slate-800">Ný tilkynning til allra starfsmanna</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titill"
            className={field}
          />
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Skilaboð…"
            className={field}
          />
          <button
            onClick={send}
            disabled={busy || !title.trim() || !body.trim()}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Sendi…" : "Senda tilkynningu"}
          </button>
        </div>
      )}

      {/* Stjórnandi: sendar tilkynningar + hverjir hafa lesið */}
      {isManager && sent.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">Sendar tilkynningar</p>
          {sent.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
              <button onClick={() => showReaders(a.id)} className="w-full p-4 text-left">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-800">{a.title}</p>
                  <p className="shrink-0 text-xs text-slate-400">{niceDate(a.created_at)}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{a.body}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${a.total ? (a.read_count / a.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {a.read_count}/{a.total} lesið
                  </span>
                </div>
              </button>
              {openReaders === a.id && (
                <div className="border-t border-slate-100 px-4 py-3">
                  {readers.map((r) => (
                    <div key={r.email} className="flex items-center justify-between py-1">
                      <span className="text-sm text-slate-700">{r.full_name}</span>
                      {r.read_at ? (
                        <span className="text-xs font-medium text-emerald-600">
                          ✓ Lesið {niceDate(r.read_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Ólesið</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Starfsmaður: mínar tilkynningar — smelltu til að opna og lesa */}
      <div className="space-y-2">
        {isManager && mine.length > 0 && (
          <p className="text-sm font-semibold text-slate-600">Mínar tilkynningar</p>
        )}

        {mine.length > 3 && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Leita…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none focus:border-brand"
              />
            </div>
            <button
              onClick={() => setOnlyUnread((v) => !v)}
              className={`rounded-xl px-3.5 text-[13px] font-semibold ring-1 transition-colors ${
                onlyUnread
                  ? "bg-brand text-white ring-brand"
                  : "bg-white text-slate-600 ring-slate-200"
              }`}
            >
              Ólesið
            </button>
          </div>
        )}

        {mine.length === 0 && !isManager ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-slate-200/60">
            <p className="font-semibold text-slate-700">Engar tilkynningar</p>
            <p className="mt-1 text-sm text-slate-500">
              Tilkynningar frá stjórnendum birtast hér.
            </p>
          </div>
        ) : (
          mine
            .filter((a) => !onlyUnread || !a.read_at)
            .filter((a) => {
              const q = query.trim().toLowerCase();
              if (!q) return true;
              return (
                a.title.toLowerCase().includes(q) ||
                a.body.toLowerCase().includes(q) ||
                (a.sender_name ?? "").toLowerCase().includes(q)
              );
            })
            .map((a) => {
              const open = expanded === a.id;
              return (
                <div
                  key={a.id}
                  className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${
                    a.read_at ? "ring-slate-200/60" : "ring-brand/40"
                  }`}
                >
                  <button
                    onClick={() => setExpanded(open ? null : a.id)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    {!a.read_at && (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate ${
                          a.read_at ? "text-slate-700" : "font-semibold text-slate-900"
                        }`}
                      >
                        {a.title}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {a.sender_name ? `Frá: ${a.sender_name} · ` : ""}
                        {niceDate(a.created_at)}
                      </span>
                    </span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                        {a.body}
                      </p>
                      {a.read_at ? (
                        <p className="mt-3 text-xs font-medium text-emerald-600">
                          ✓ Þú kvittaðir fyrir lestur
                        </p>
                      ) : (
                        <button
                          onClick={() => markRead(a.id)}
                          className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark"
                        >
                          Ég hef lesið þetta
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
