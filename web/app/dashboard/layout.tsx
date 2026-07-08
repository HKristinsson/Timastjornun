import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

const nav = [
  { href: "/dashboard", label: "Yfirlit" },
  { href: "/dashboard/projects", label: "Verkefni" },
  { href: "/dashboard/map", label: "Kort" },
  { href: "/dashboard/employees", label: "Starfsmenn" },
  { href: "/dashboard/time-entries", label: "Tímar" },
  { href: "/dashboard/reports", label: "Skýrslur" },
  { href: "/mail", label: "Skilaboð" },
  { href: "/dashboard/settings", label: "Stillingar" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <span className="font-semibold text-brand">Tímastjórnun</span>
          <nav className="flex flex-1 gap-4 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-slate-600 hover:text-brand"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
