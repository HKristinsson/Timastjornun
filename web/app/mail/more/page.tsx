"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { myMailAccess } from "@/lib/mail/service";

function Row({ href, title, icon }: { href: string; title: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60 transition-colors hover:bg-slate-50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand">
        {icon}
      </span>
      <span className="flex-1 font-semibold text-slate-800">{title}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

export default function MorePage() {
  const [access, setAccess] = useState<{ hasMail: boolean; isManager: boolean } | null>(null);

  useEffect(() => {
    myMailAccess().then(setAccess).catch(() => setAccess({ hasMail: false, isManager: false }));
  }, []);

  return (
    <div className="space-y-3">
      <h1 className="text-[22px] font-bold tracking-tight">Meira</h1>

      {access?.hasMail && (
        <Row
          href="/mail/sent"
          title="Send skeyti"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13 M22 2 15 22l-4-9-9-4z" />
            </svg>
          }
        />
      )}
      {access?.isManager && (
        <Row
          href="/mail/admin"
          title="Póstmóttakendur"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            </svg>
          }
        />
      )}
      <Row
        href="/mail/settings"
        title="Stillingar"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4 M12 19v4 M4.2 4.2l2.8 2.8 M17 17l2.8 2.8 M1 12h4 M19 12h4 M4.2 19.8 7 17 M17 7l2.8-2.8" />
          </svg>
        }
      />
    </div>
  );
}
