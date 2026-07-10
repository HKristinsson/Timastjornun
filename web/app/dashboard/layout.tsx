import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import ActingBanner from "@/components/ActingBanner";
import SuperGuard from "@/components/SuperGuard";

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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let isSuper = false;
  let hasActing = false;
  try {
    const supabase = await createClient();
    const [{ data: roles }, { data: acting }] = await Promise.all([
      supabase.rpc("my_roles"),
      supabase.rpc("su_acting_tenant"),
    ]);
    isSuper = ((roles ?? []) as string[]).includes("super_admin");
    hasActing = ((acting ?? []) as unknown[]).length > 0;
  } catch {
    // án Supabase-tengingar: sjálfgefin valmynd
  }

  // Super án valins félags: aðeins Félög — allt annað krefst þess að félag sé valið
  const superNoActing = isSuper && !hasActing;
  const items = superNoActing
    ? [{ href: "/dashboard/companies", label: "Félög" }]
    : isSuper
    ? [...nav, { href: "/dashboard/companies", label: "Félög" }]
    : nav;

  return (
    <div className="min-h-screen">
      <SuperGuard active={superNoActing} />
      {isSuper && <ActingBanner />}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
          <span className="font-semibold text-brand">Tímaverk</span>
          <nav className="flex flex-1 flex-wrap gap-4 text-sm">
            {items.map((n) => (
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
