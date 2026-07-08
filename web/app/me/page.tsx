"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ActiveEntry {
  id: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
}

export default function MeHome() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("v_my_active_entry")
      .select("id, project_name, project_no, check_in_at")
      .maybeSingle()
      .then(({ data }) => {
        setActive((data as ActiveEntry) ?? null);
        setLoading(false);
      });
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tímaskráning</h1>
        <button onClick={signOut} className="text-sm text-slate-500">
          Útskrá
        </button>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-slate-400">STAÐA NÚNA</p>
        {loading ? (
          <p className="text-slate-400">Hleð…</p>
        ) : active ? (
          <>
            <p className="text-lg font-semibold text-green-600">🟢 Innskráð(ur)</p>
            <p className="mt-1 text-slate-700">
              {active.project_no} {active.project_name}
            </p>
            <Link
              href="/me/active"
              className="mt-4 block rounded-xl bg-brand py-3 text-center font-semibold text-white"
            >
              Opna virka skráningu
            </Link>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-slate-600">⚫ Ekki innskráð(ur)</p>
            <Link
              href="/me/select"
              className="mt-4 block rounded-xl bg-brand py-3 text-center font-semibold text-white"
            >
              + Skrá inn á verkefni
            </Link>
          </>
        )}
      </div>

      <Link
        href="/me/timesheet"
        className="block rounded-xl bg-white p-4 shadow-sm"
      >
        📋 Tímayfirlit mitt
      </Link>

      <Link href="/mail" className="block rounded-xl bg-white p-4 shadow-sm">
        📬 Skilaboð
      </Link>
    </div>
  );
}
