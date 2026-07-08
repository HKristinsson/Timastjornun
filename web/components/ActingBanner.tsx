"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Borði sem sýnir þegar super admin er að vinna sem annað félag.
export default function ActingBanner() {
  const [acting, setActing] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    createClient()
      .rpc("su_acting_tenant")
      .then(({ data }) => {
        const rows = (data ?? []) as { id: string; name: string }[];
        setActing(rows[0] ?? null);
      });
  }, []);

  if (!acting) return null;

  async function stop() {
    await createClient().rpc("su_set_acting_tenant", { p_tenant: null });
    window.location.href = "/dashboard/companies";
  }

  return (
    <div className="bg-amber-400">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-2">
        <p className="text-sm font-semibold text-amber-950">
          ⚡ Þú ert að vinna sem <span className="underline">{acting.name}</span> — allar
          aðgerðir (starfsmenn, verkefni, póstur) eiga við það félag.
        </p>
        <button
          onClick={stop}
          className="shrink-0 rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-900"
        >
          Hætta
        </button>
      </div>
    </div>
  );
}
