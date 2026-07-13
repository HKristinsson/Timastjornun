"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { myMailAccess } from "@/lib/mail/service";
import { LogoMark } from "@/components/Logo";

interface ActiveEntry {
  id: string;
  project_name: string;
  project_no: string;
  check_in_at: string;
}

function CardLink({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 transition-colors hover:bg-slate-50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-800">{title}</span>
        <span className="block truncate text-sm text-slate-500">{subtitle}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

export default function MeHome() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMail, setHasMail] = useState(false);

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
    myMailAccess().then((a) => setHasMail(a.hasMail)).catch(() => {});
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2">
          <LogoMark size={30} />
          <span className="text-xl font-bold tracking-tight text-slate-900">Tímaverk</span>
        </span>
        <button onClick={signOut} className="text-sm font-medium text-slate-500 hover:text-red-600">
          Útskrá
        </button>
      </div>

      {/* Staða */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
        <div className={`h-1.5 ${active ? "bg-emerald-500" : "bg-slate-200"}`} />
        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Staða núna
          </p>
          {loading ? (
            <div className="mt-3 h-16 animate-pulse rounded-xl bg-slate-100" />
          ) : active ? (
            <>
              <p className="mt-2 flex items-center gap-2 text-lg font-bold text-emerald-600">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                Innskráð(ur)
              </p>
              <p className="mt-0.5 text-slate-700">
                {active.project_no} {active.project_name} · frá kl.{" "}
                {new Date(active.check_in_at).toLocaleTimeString("is-IS", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <Link
                href="/me/active"
                className="mt-4 block rounded-xl bg-brand py-3.5 text-center font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                Opna virka skráningu
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-bold text-slate-600">Ekki innskráð(ur)</p>
              <Link
                href="/me/select"
                className="mt-4 block rounded-xl bg-brand py-3.5 text-center font-semibold text-white transition-colors hover:bg-brand-dark"
              >
                + Skrá inn á verkefni
              </Link>
            </>
          )}
        </div>
      </div>

      <CardLink
        href="/me/sick"
        title="Skrá veikindi"
        subtitle="Tilkynna veikindadaga til verkstjóra"
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z" />
          </svg>
        }
      />
      <CardLink
        href="/me/timesheet"
        title="Tímayfirlit"
        subtitle="Skráðir tímar og staða samþykktar"
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2" />
          </svg>
        }
      />
      {hasMail ? (
        <CardLink
          href="/mail"
          title="Skilaboð"
          subtitle="Innhólfið þitt og send skeyti"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6" />
            </svg>
          }
        />
      ) : (
        <CardLink
          href="/mail/announcements"
          title="Tilkynningar"
          subtitle="Skilaboð frá stjórnendum"
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          }
        />
      )}
    </div>
  );
}
