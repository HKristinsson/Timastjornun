"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { myMailAccess } from "@/lib/mail/service";
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
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  more: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
};

// Póst-tengdar slóðir sem krefjast póst-aðgangs (hóps-2 hak eða stjórnandi)
const MAIL_ONLY = ["/mail/compose", "/mail/sent"];

export default function MailLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState<{
    hasMail: boolean;
    isManager: boolean;
    email?: string | null;
  } | null>(null);

  useEffect(() => {
    myMailAccess()
      .then((a) => setAccess(a))
      .catch(() => setAccess({ hasMail: false, isManager: false }));
  }, []);

  // Notandi án pósts: beina póst-slóðum á tilkynningar
  useEffect(() => {
    if (!access || access.hasMail) return;
    const isMailPage =
      pathname === "/mail" ||
      MAIL_ONLY.some((p) => pathname.startsWith(p)) ||
      /^\/mail\/[0-9a-f-]{36}/.test(pathname);
    if (isMailPage) router.replace("/mail/announcements");
  }, [access, pathname, router]);

  const timeHref = access?.isManager ? "/dashboard" : "/me";

  const nav = [
    ...(access?.hasMail ? [{ href: "/mail", label: "Skilaboð", icon: ICONS.mail }] : []),
    { href: "/mail/announcements", label: "Tilkynningar", icon: ICONS.bell },
    { href: timeHref, label: "Tímar", icon: ICONS.clock },
    { href: "/mail/more", label: "Meira", icon: ICONS.more },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
          <span className="inline-flex items-center gap-2">
            <LogoMark size={28} />
            <span className="font-semibold tracking-tight text-slate-900">
              Tímaverk <span className="font-normal text-slate-400">· Skilaboð</span>
            </span>
          </span>
          {/* Sýnir alltaf HVER er innskráður — innhólf og úthólf fylgja þessum notanda */}
          {access?.email && (
            <span className="truncate text-xs font-medium text-slate-400">
              {access.email}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 pb-28 pt-5">
        {access === null ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white/70" />
        ) : (
          children
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md justify-around">
          {nav.map((n) => {
            const active =
              n.href === "/mail"
                ? pathname === "/mail" ||
                  pathname.startsWith("/mail/sent") ||
                  pathname.startsWith("/mail/compose") ||
                  /^\/mail\/[0-9a-f-]{36}/.test(pathname)
                : pathname.startsWith(n.href) && n.href.startsWith("/mail");
            return (
              <Link
                key={n.href}
                href={n.href}
                className="flex min-w-[58px] flex-col items-center gap-1 px-1 py-2.5"
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
