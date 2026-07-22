"use client";

// Gera starfsmann að stjórnanda (admin) félagsins — hann fær þá strax
// aðgang að stjórnborðinu á vefnum og Stjórnun-hlutanum í appinu.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function translateError(msg: string): string {
  if (msg.includes("NO_LOGIN"))
    return "Starfsmaðurinn þarf innskráningu (netfang + lykilorð) áður en hægt er að gera hann að stjórnanda.";
  if (msg.includes("SELF_DEMOTE"))
    return "Þú getur ekki tekið stjórnandaréttindi af sjálfum þér.";
  if (msg.includes("FORBIDDEN")) return "Aðeins stjórnendur mega breyta þessu.";
  return msg;
}

export default function EmployeeAdminToggle({ employeeId }: { employeeId: string }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .rpc("employee_is_admin", { p_employee_id: employeeId })
      .then(({ data }) => setIsAdmin((data as boolean) ?? false));
  }, [employeeId]);

  async function toggle() {
    if (isAdmin == null) return;
    const next = !isAdmin;
    if (
      next &&
      !window.confirm(
        "Gera þennan starfsmann að stjórnanda? Hann fær full réttindi yfir félaginu: starfsmenn, verkefni, tíma, skilaboð og Stjórnun í appinu."
      )
    )
      return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("employee_set_admin", {
      p_employee_id: employeeId,
      p_admin: next,
    });
    setBusy(false);
    if (error) {
      setError(translateError(error.message));
      return;
    }
    setIsAdmin(next);
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">
            Stjórnandi félagsins
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Stjórnandi hefur full réttindi í stjórnborðinu og sér
            Stjórnun-hlutann í appinu (yfirlit, kort, tímar, verkefnastofnun).
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy || isAdmin == null}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            isAdmin ? "bg-brand" : "bg-slate-300"
          }`}
          aria-label={isAdmin ? "Afturkalla stjórnandaréttindi" : "Gera að stjórnanda"}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
              isAdmin ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {isAdmin && (
        <p className="mt-3 inline-block rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
          ✓ Þessi starfsmaður er stjórnandi
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
