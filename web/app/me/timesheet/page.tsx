"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Entry {
  id: string;
  project_no: string;
  project_name: string;
  check_in_at: string;
  check_out_at: string | null;
  worked_hours: number | null;
  status: string;
}

const STATUS: Record<string, string> = {
  active: "Virk",
  pending: "Í bið",
  approved: "Samþykkt",
  rejected: "Hafnað",
};

export default function MeTimesheet() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient()
      .from("v_time_entries")
      .select("id, project_no, project_name, check_in_at, check_out_at, worked_hours, status")
      .order("check_in_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries((data as Entry[]) ?? []);
        setLoading(false);
      });
  }, []);

  const total = entries.reduce((s, e) => s + (e.worked_hours ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/me" className="text-slate-500">
          ←
        </Link>
        <h1 className="text-xl font-bold">Tímayfirlit</h1>
      </div>

      {loading ? (
        <p className="text-slate-400">Hleð…</p>
      ) : (
        <>
          <p className="font-semibold">Samtals: {Math.round(total * 100) / 100} klst</p>
          {entries.length === 0 ? (
            <p className="text-slate-400">Engar skráningar.</p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-semibold">
                    {e.project_no} {e.project_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(e.check_in_at).toLocaleDateString("is-IS")}{" "}
                    {new Date(e.check_in_at).toLocaleTimeString("is-IS", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {e.check_out_at
                      ? `–${new Date(e.check_out_at).toLocaleTimeString("is-IS", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{e.worked_hours ?? "—"} klst</p>
                  <p className="text-sm text-slate-500">{STATUS[e.status] ?? e.status}</p>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
