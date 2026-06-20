"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentFix } from "@/lib/browser-geo";

interface ActiveEntry {
  id: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
}

const POLL_MS = 30_000; // GPS lesið á 30 sek fresti
const GRACE_SEC = 600; // 10 mín áður en sjálfvirk útskráning

export default function MeActive() {
  const router = useRouter();
  const [entry, setEntry] = useState<ActiveEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [inside, setInside] = useState<boolean | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [graceLeft, setGraceLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const entryRef = useRef<ActiveEntry | null>(null);
  entryRef.current = entry;

  useEffect(() => {
    createClient()
      .from("v_my_active_entry")
      .select("id, project_name, project_no, check_in_at")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          router.push("/me");
          return;
        }
        setEntry(data as ActiveEntry);
      });
  }, [router]);

  // Klukka
  useEffect(() => {
    if (!entry) return;
    const start = new Date(entry.check_in_at).getTime();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [entry]);

  const doAutoCheckout = useCallback(async () => {
    const e = entryRef.current;
    if (!e) return;
    await createClient().rpc("auto_check_out", {
      p_time_entry_id: e.id,
      p_reason: "auto_geofence",
    });
    alert("Þú varst skráð(ur) út sjálfkrafa þar sem þú fórst af svæðinu.");
    router.push("/me");
  }, [router]);

  // Staðsetningarvöktun
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    const supabase = createClient();

    async function poll() {
      const e = entryRef.current;
      if (!e || cancelled) return;
      try {
        const fix = await getCurrentFix();
        const { data, error } = await supabase.rpc("log_location", {
          p_time_entry_id: e.id,
          p_lat: fix.lat,
          p_lng: fix.lng,
          p_accuracy: fix.accuracy,
        });
        if (error) return;
        const isInside = data as boolean;
        setInside(isInside);
        setLastChecked(new Date());
        setGraceLeft(isInside ? null : (prev) => (prev == null ? GRACE_SEC : prev));
      } catch {
        // GPS gæti dottið út — reynt aftur næst
      }
    }

    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [entry]);

  // Niðurtalning utan svæðis
  useEffect(() => {
    if (graceLeft == null) return;
    if (graceLeft <= 0) {
      doAutoCheckout();
      return;
    }
    const t = setTimeout(() => setGraceLeft((g) => (g == null ? null : g - 1)), 1000);
    return () => clearTimeout(t);
  }, [graceLeft, doAutoCheckout]);

  async function checkOut() {
    if (!entry) return;
    setBusy(true);
    let fix: { lat: number; lng: number; accuracy: number | null } | null = null;
    try {
      fix = await getCurrentFix();
    } catch {
      // leyfum útskráningu þótt GPS náist ekki
    }
    const { error } = await createClient().rpc("check_out", {
      p_time_entry_id: entry.id,
      p_lat: fix?.lat ?? null,
      p_lng: fix?.lng ?? null,
      p_accuracy: fix?.accuracy ?? null,
      p_note: null,
    });
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.push("/me");
  }

  if (!entry) return <p className="text-slate-400">Hleð…</p>;

  const warning = graceLeft != null;

  return (
    <div
      className={`rounded-2xl p-6 text-center shadow-sm ${
        warning ? "bg-orange-50" : "bg-white"
      }`}
    >
      <p className="text-xs font-semibold text-slate-400">VIRK SKRÁNING</p>
      <p className="mt-1 text-lg font-semibold">
        {entry.project_no} {entry.project_name}
      </p>

      <p className="my-8 text-6xl font-extralight tabular-nums">{fmt(elapsed)}</p>

      {warning ? (
        <div className="rounded-xl border border-orange-300 bg-white p-4">
          <p className="font-bold text-orange-600">⚠ Þú ert utan svæðis</p>
          <p className="mt-1 text-sm text-orange-800">
            Sjálfvirk útskráning eftir {fmt(graceLeft ?? 0)}
          </p>
          <p className="text-sm text-orange-800">Farðu aftur inn á svæðið.</p>
        </div>
      ) : (
        <p className="text-green-600">
          {inside === null
            ? "📍 Athuga staðsetningu…"
            : inside
            ? "📍 Innan svæðis ✅"
            : "📍 Staðsetning óviss"}
        </p>
      )}

      {lastChecked && (
        <p className="mt-2 text-xs text-slate-400">
          Síðast athugað kl.{" "}
          {lastChecked.toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      <button
        onClick={checkOut}
        disabled={busy}
        className="mt-8 w-full rounded-xl bg-red-600 py-4 text-lg font-bold text-white disabled:opacity-50"
      >
        ⏹ Skrá út
      </button>
    </div>
  );
}

function fmt(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
