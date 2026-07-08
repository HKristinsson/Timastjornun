"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";

function Icon({ d, active }: { d: string; active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "#2563eb" : "#64748b"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z",
  compose: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  sent: "M22 2 11 13 M22 2 15 22l-4-9-9-4z",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.6.26 1.05.8 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
};

export default function MailLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("my_roles")
      .then(({ data }) => {
        const roles: string[] = data ?? [];
        setIsManager(roles.includes("admin") || roles.includes("project_manager"));
      });
  }, []);

  const nav = [
    { href: "/mail", label: "Innhólf", icon: ICONS.inbox },
    { href: "/mail/compose", label: "Skrifa", icon: ICONS.compose },
    { href: "/mail/sent", label: "Sent", icon: ICONS.sent },
    ...(isManager ? [{ href: "/mail/admin", label: "Stjórnun", icon: ICONS.users }] : []),
    { href: "/mail/settings", label: "Stillingar", icon: ICONS.settings },
  ];

  const timeHref = isManager ? "/dashboard" : "/me";

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Haus */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <span className="inline-flex items-center gap-2">
            <LogoMark size={28} />
            <span className="font-semibold tracking-tight text-slate-900">
              Tímaverk <span className="font-normal text-slate-400">· Skilaboð</span>
            </span>
          </span>
          <Link
            href={timeHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1.5 pl-2.5 pr-3 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"
          >
            <Icon d={ICONS.clock} active={false} />
            Tímaskráning
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pb-28 pt-5">{children}</div>

      {/* Botnvalmynd */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md justify-around">
          {nav.map((n) => {
            const active =
              n.href === "/mail" ? pathname === "/mail" || /^\/mail\/[0-9a-f-]{36}/.test(pathname) : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex min-w-[62px] flex-col items-center gap-1 px-1 py-2.5"
              >
                <Icon d={n.icon} active={active} />
                <span
                  className={`text-[10.5px] font-medium ${
                    active ? "text-brand" : "text-slate-500"
                  }`}
                >
                  {n.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
