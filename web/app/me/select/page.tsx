"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentFix, distanceMeters, translateRpcError, type Fix } from "@/lib/browser-geo";

interface MyProject {
  id: string;
  project_no: string;
  name: string;
  address: string | null;
  radius_m: number | null;
  lat: number | null;
  lng: number | null;
}

export default function SelectProject() {
  const router = useRouter();
  const [fix, setFix] = useState<Fix | null>(null);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      try {
        const f = await getCurrentFix();
        setFix(f);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Staðsetning fékkst ekki.");
      }
      const { data } = await supabase
        .from("v_my_projects")
        .select("id, project_no, name, address, radius_m, lat, lng");
      setProjects((data as MyProject[]) ?? []);
      setLoading(false);
    })();
  }, []);

  async function checkIn(p: MyProject) {
    if (!fix) return;
    setCheckingIn(p.id);
    const { error } = await createClient().rpc("check_in", {
      p_project_id: p.id,
      p_lat: fix.lat,
      p_lng: fix.lng,
      p_accuracy: fix.accuracy,
      p_note: null,
    });
    setCheckingIn(null);
    if (error) {
      setError(translateRpcError(error.message));
      return;
    }
    router.push("/me/active");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/me" className="text-slate-500">
          ←
        </Link>
        <h1 className="text-xl font-bold">Velja verkefni</h1>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-400">Sæki staðsetningu…</p>
      ) : projects.length === 0 ? (
        <p className="text-slate-400">Engin verkefni úthlutuð.</p>
      ) : (
        projects.map((p) => {
          const dist =
            fix && p.lat != null && p.lng != null
              ? distanceMeters(fix.lat, fix.lng, p.lat, p.lng)
              : null;
          const inside = dist != null && p.radius_m != null && dist <= p.radius_m;
          return (
            <div key={p.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-semibold">
                {p.project_no} {p.name}
              </p>
              {p.address && <p className="text-sm text-slate-500">{p.address}</p>}
              <p className={`mt-2 text-sm ${inside ? "text-green-600" : "text-slate-500"}`}>
                📍{" "}
                {dist == null
                  ? "Staðsetning óþekkt"
                  : inside
                  ? `Innan svæðis (${dist} m)`
                  : `${dist} m í burtu`}
              </p>
              <button
                disabled={!inside || checkingIn === p.id}
                onClick={() => checkIn(p)}
                className={`mt-3 w-full rounded-xl py-3 font-semibold text-white ${
                  inside ? "bg-brand" : "bg-slate-300"
                }`}
              >
                {checkingIn === p.id ? "Augnablik…" : inside ? "Skrá inn" : "Of langt"}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
