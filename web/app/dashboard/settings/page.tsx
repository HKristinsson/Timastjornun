import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "./actions";

export const dynamic = "force-dynamic";

interface SettingRow {
  key: string;
  value: number | string;
  scope: string;
}

const FIELDS: { key: string; label: string; suffix: string; def: number }[] = [
  { key: "gps_poll_interval_sec", label: "Lestrartíðni GPS meðan innskráður", suffix: "sek", def: 60 },
  { key: "min_accuracy_m", label: "Lágmarksnákvæmni krafist", suffix: "m", def: 50 },
  { key: "grace_period_min", label: "Grace period áður en sjálfvirk útskráning", suffix: "mín", def: 10 },
  { key: "gps_lost_timeout_min", label: "Sjálfvirk útskráning ef GPS dettur út", suffix: "mín", def: 15 },
  { key: "default_radius_m", label: "Sjálfgefinn radíus", suffix: "m", def: 100 },
  { key: "location_log_retention_days", label: "Geymslutími staðsetningarloga (GDPR)", suffix: "dagar", def: 90 },
];

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function getEffective(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("v_effective_settings")
      .select("key, value, scope");
    const rows = (data ?? []) as SettingRow[];
    // company override > global
    for (const scope of ["global", "company"]) {
      for (const r of rows.filter((x) => x.scope === scope)) {
        out[r.key] = Number(r.value);
      }
    }
  } catch {
    // skilar tómu — sjálfgefin gildi notuð
  }
  return out;
}

export default async function SettingsPage() {
  const eff = await getEffective();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Kerfisstillingar — GPS-reglur</h1>
      <p className="text-sm text-slate-500">
        Stillingar gilda fyrir fyrirtækið og yfirskrifa sjálfgefin gildi kerfisins.
      </p>

      <form action={saveSettings} className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-4">
            <label className="text-sm">{f.label}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                name={f.key}
                defaultValue={eff[f.key] ?? f.def}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
              />
              <span className="w-12 text-sm text-slate-400">{f.suffix}</span>
            </div>
          </div>
        ))}

        <div className="border-t border-slate-100 pt-4">
          <h2 className="text-[15px] font-semibold text-slate-800">
            Staðsetning starfsmanna á korti
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Stjórnendur sjá staðsetningu innskráðra starfsmanna aðeins innan
            þessa tímaglugga.
          </p>
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm">Sýnileg frá</label>
              <input
                type="time"
                name="tracking_start"
                defaultValue={minutesToTime(eff["tracking_start_min"] ?? 480)}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm">Sýnileg til</label>
              <input
                type="time"
                name="tracking_end"
                defaultValue={minutesToTime(eff["tracking_end_min"] ?? 960)}
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm"
              />
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              Líka um helgar
              <input
                type="checkbox"
                name="tracking_weekends"
                defaultChecked={(eff["tracking_weekends"] ?? 0) === 1}
                className="h-4 w-4 accent-blue-600"
              />
            </label>
          </div>
        </div>

        <div className="pt-2">
          <button className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Vista stillingar
          </button>
        </div>
      </form>
    </div>
  );
}
