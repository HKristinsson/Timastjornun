"use client";

// Opið eða lokað verkefni: opið = allir starfsmenn félagsins sjá það og
// geta skráð sig inn; lokað = aðeins úthlutaðir starfsmenn.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProjectOpenToggle({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("v_projects")
      .select("open_access")
      .eq("id", projectId)
      .single()
      .then(({ data }) =>
        setOpen((data as { open_access: boolean } | null)?.open_access ?? false)
      );
  }, [projectId]);

  async function toggle() {
    if (open == null) return;
    const next = !open;
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("project_set_open", {
      p_id: projectId,
      p_open: next,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOpen(next);
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">
            Opið öllum starfsmönnum
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {open
              ? "Allir starfsmenn félagsins sjá verkefnið í appinu og geta skráð sig inn."
              : "Lokað: aðeins starfsmenn með úthlutun (valdir hér að neðan í starfsmannaforminu) sjá verkefnið."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || open == null}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            open ? "bg-brand" : "bg-slate-300"
          }`}
          aria-label={open ? "Loka verkefninu" : "Opna verkefnið öllum"}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              open ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
