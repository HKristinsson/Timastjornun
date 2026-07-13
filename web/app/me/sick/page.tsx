"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Absence {
  id: string;
  date_from: string;
  date_to: string;
  note: string | null;
  created_at: string;
}

const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] outline-none focus:border-brand focus:bg-white";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("is-IS", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SickPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    createClient()
      .from("v_my_absences")
      .select("*")
      .then(({ data }) => {
        setAbsences((data ?? []) as Absence[]);
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  async function register() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error } = await createClient().rpc("absence_register", {
      p_from: from,
      p_to: to,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("BAD_RANGE")
          ? "Lokadagur má ekki vera á undan upphafsdegi."
          : error.message.includes("EMP_NOT_FOUND")
          ? "Enginn virkur starfsmaður tengdur þessum notanda."
          : error.message
      );
      return;
    }
    setNotice("Veikindi skráð — verkstjóri sér skráninguna.");
    setNote("");
    load();
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-6">
      <div className="flex items-center gap-2">
        <Link href="/me" className="text-slate-500">
          ←
        </Link>
        <h1 className="text-xl font-bold">Skrá veikindi</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Frá degi
            </label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Til dags
            </label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Athugasemd <span className="font-normal text-slate-400">(valfrjálst)</span>
          </label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
        </div>
        <button
          onClick={register}
          disabled={busy || !from || !to}
          className="w-full rounded-xl bg-brand py-3.5 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "Skrái…" : "🤒 Skrá veikindi"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">Mínar skráningar</p>
        {loading ? (
          <div className="h-16 animate-pulse rounded-2xl bg-white/70" />
        ) : absences.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-sm text-slate-400 shadow-sm ring-1 ring-slate-200/60">
            Engar veikindaskráningar.
          </p>
        ) : (
          absences.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
              <p className="font-medium text-slate-800">
                {a.date_from === a.date_to
                  ? fmtDate(a.date_from)
                  : `${fmtDate(a.date_from)} – ${fmtDate(a.date_to)}`}
              </p>
              {a.note && <p className="mt-0.5 text-sm text-slate-500">{a.note}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
