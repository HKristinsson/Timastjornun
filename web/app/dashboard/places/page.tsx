"use client";

// Staðir félagsins (t.d. verslun/lager): stofna með korti, virkja/afvirkja,
// eyða — og sjá hve oft og lengi hver starfsmaður hefur verið á staðnum.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MapPicker from "@/components/MapPicker";

interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
}

interface Visit {
  employee_id: string;
  full_name: string;
  visits: number;
  total_minutes: number;
  last_visit: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} klst ${m} mín` : `${m} mín`;
}

export default function PlacesPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Heimsóknir opins staðar
  const [openPlace, setOpenPlace] = useState<Place | null>(null);
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(isoDate(new Date()));
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("v_places")
      .select("id, name, address, lat, lng, radius_m, active")
      .order("name");
    if (error) setError(error.message);
    else setPlaces((data ?? []) as Place[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const lat = Number(fd.get("lat"));
    const lng = Number(fd.get("lng"));
    const radius = Number(fd.get("radius_m")) || 100;
    const address = String(fd.get("address") ?? "").trim();
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("place_create", {
      p_name: name,
      p_address: address || null,
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radius,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setShowCreate(false);
    load();
  }

  async function toggleActive(p: Place) {
    await createClient().rpc("place_update", { p_id: p.id, p_active: !p.active });
    load();
  }

  async function remove(p: Place) {
    if (!window.confirm(`Eyða staðnum „${p.name}"?`)) return;
    await createClient().rpc("place_delete", { p_id: p.id });
    if (openPlace?.id === p.id) setOpenPlace(null);
    load();
  }

  const loadVisits = useCallback(
    async (place: Place, fromDate: string, toDate: string) => {
      setVisitsLoading(true);
      setVisits(null);
      const { data, error } = await createClient().rpc("place_visits", {
        p_place_id: place.id,
        p_from: `${fromDate}T00:00:00Z`,
        p_to: `${toDate}T23:59:59Z`,
      });
      setVisitsLoading(false);
      if (error) setError(error.message);
      else setVisits((data ?? []) as Visit[]);
    },
    []
  );

  function openVisits(p: Place) {
    if (openPlace?.id === p.id) {
      setOpenPlace(null);
      return;
    }
    setOpenPlace(p);
    loadVisits(p, from, to);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Staðir</h1>
        <p className="mt-1 text-sm text-slate-500">
          Skilgreindu staði sem starfsmenn koma við á (t.d. verslun eða lager)
          og sjáðu hve oft og lengi hver starfsmaður hefur verið þar.
          Ferðir eru reiknaðar úr staðsetningum meðan starfsmaður er
          innskráður á verk.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white/70" />
      ) : places.length === 0 && !showCreate ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200/60">
          Engir staðir skráðir enn.
        </div>
      ) : (
        <div className="space-y-3">
          {places.map((p) => (
            <div
              key={p.id}
              className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60"
            >
              <div className={`flex items-center gap-3 px-5 py-4 ${p.active ? "" : "opacity-60"}`}>
                <span className="text-xl">📍</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{p.name}</p>
                  <p className="truncate text-xs text-slate-400">
                    {p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`} ·{" "}
                    {p.radius_m} m radíus
                  </p>
                </div>
                <button
                  onClick={() => openVisits(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
                    openPlace?.id === p.id
                      ? "bg-brand text-white ring-brand"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Heimsóknir
                </button>
                <button
                  onClick={() => toggleActive(p)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ${
                    p.active
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-slate-50 text-slate-500 ring-slate-200"
                  }`}
                >
                  {p.active ? "Virkur" : "Óvirkur"}
                </button>
                <button
                  onClick={() => remove(p)}
                  aria-label={`Eyða ${p.name}`}
                  className="p-1.5 text-red-500 hover:text-red-700"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              </div>

              {openPlace?.id === p.id && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-500">Tímabil:</span>
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => loadVisits(p, from, to)}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
                    >
                      Sækja
                    </button>
                  </div>

                  {visitsLoading ? (
                    <div className="h-16 animate-pulse rounded-xl bg-white" />
                  ) : !visits || visits.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Engar heimsóknir á tímabilinu.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                            <th className="px-3.5 py-2 font-medium">Starfsmaður</th>
                            <th className="px-3.5 py-2 text-right font-medium">Heimsóknir</th>
                            <th className="px-3.5 py-2 text-right font-medium">Samtals tími</th>
                            <th className="px-3.5 py-2 text-right font-medium">Síðast</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visits.map((v) => (
                            <tr key={v.employee_id} className="border-t border-slate-50">
                              <td className="px-3.5 py-2.5 font-medium text-slate-800">
                                {v.full_name}
                              </td>
                              <td className="px-3.5 py-2.5 text-right tabular-nums">
                                {v.visits}×
                              </td>
                              <td className="px-3.5 py-2.5 text-right tabular-nums">
                                {fmtDuration(v.total_minutes)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-xs text-slate-400">
                                {new Date(v.last_visit).toLocaleString("is-IS", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <form
          onSubmit={create}
          className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60"
        >
          <p className="text-sm font-semibold text-slate-700">Nýr staður</p>
          <input
            name="name"
            required
            placeholder="Heiti (t.d. BYKO Breidd)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] outline-none focus:border-brand focus:bg-white"
          />
          <MapPicker />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? "Vista…" : "Vista stað"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-slate-200 px-4 py-3 font-medium text-slate-600"
            >
              Hætta við
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 py-4 font-semibold text-slate-500 transition-colors hover:border-brand hover:text-brand"
        >
          + Stofna nýjan stað
        </button>
      )}
    </div>
  );
}
