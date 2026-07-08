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

      {/* Starfsmaður: mínar tilkynningar með les-kvittun */}
      <div className="space-y-2">
        {isManager && mine.length > 0 && (
          <p className="text-sm font-semibold text-slate-600">Mínar tilkynningar</p>
        )}
        {mine.length === 0 && !isManager ? (
          <div className="rounded-2xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-slate-200/60">
            <p className="font-semibold text-slate-700">Engar tilkynningar</p>
            <p className="mt-1 text-sm text-slate-500">
              Tilkynningar frá stjórnendum birtast hér.
            </p>
          </div>
        ) : (
          mine.map((a) => (
            <div
              key={a.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${
                a.read_at ? "ring-slate-200/60" : "ring-brand/40"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className={`${a.read_at ? "" : "font-semibold"} text-slate-800`}>
                  {a.title}
                </p>
                <p className="shrink-0 text-xs text-slate-400">{niceDate(a.created_at)}</p>
              </div>
              {a.sender_name && (
                <p className="mt-0.5 text-xs text-slate-400">Frá: {a.sender_name}</p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {a.body}
              </p>
              {a.read_at ? (
                <p className="mt-3 text-xs font-medium text-emerald-600">
                  ✓ Þú kvittaðir fyrir lestur
                </p>
              ) : (
                <button
                  onClick={() => markRead(a.id)}
                  className="mt-3 w-full rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark"
                >
                  Ég hef lesið þetta
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
