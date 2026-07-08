import Link from "next/link";

// Mobile-first skilaboðahluti. Botnvalmynd með stórum snertiflötum.
const nav = [
  { href: "/mail", label: "Innhólf", icon: "📥" },
  { href: "/mail/compose", label: "Skrifa", icon: "✏️" },
  { href: "/mail/sent", label: "Sent", icon: "📤" },
  { href: "/mail/admin", label: "Stjórnun", icon: "👥" },
  { href: "/mail/settings", label: "Stillingar", icon: "⚙️" },
];

export default function MailLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md justify-around">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex min-w-[64px] flex-col items-center gap-0.5 px-2 py-3 text-slate-600 hover:text-brand"
            >
              <span className="text-xl leading-none">{n.icon}</span>
              <span className="text-[11px] font-medium">{n.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
