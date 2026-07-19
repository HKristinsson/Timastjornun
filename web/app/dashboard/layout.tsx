import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import ActingBanner from "@/components/ActingBanner";
import SuperGuard from "@/components/SuperGuard";

interface NavItem {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

// Aðalvalmynd þegar unnið er í félagi: 4 flokkar með undirvalmyndum
const nav: NavItem[] = [
  {
    label: "Yfirlit",
    href: "/dashboard",
    children: [
      { label: "Tímar", href: "/dashboard/time-entries" },
      { label: "Skýrslur", href: "/dashboard/reports" },
    ],
  },
  {
    label: "Starfsmenn",
    href: "/dashboard/employees",
    children: [
      { label: "Tímar", href: "/dashboard/time-entries" },
      { label: "Skýrslur", href: "/dashboard/reports" },
      { label: "Skilaboð", href: "/mail" },
    ],
  },
  {
    label: "Verkefni",
    href: "/dashboard/projects",
    children: [{ label: "Kort af verkefnum", href: "/dashboard/map" }],
  },
  { label: "Stillingar", href: "/dashboard/settings" },
];

function NavEntry({ item }: { item: NavItem }) {
  if (!item.children) {
    return (
      <Link href={item.href} className="py-2 text-slate-600 hover:text-brand">
        {item.label}
      </Link>
    );
  }
  return (
    <div className="group relative">
      <Link
        href={item.href}
        className="inline-flex items-center gap-1 py-2 text-slate-600 hover:text-brand"
      >
        {item.label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 opacity-60">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Link>
      {/* pt-1 heldur hover-svæðinu samfelldu milli hlekks og valmyndar */}
      <div className="absolute left-0 top-full z-30 hidden pt-1 group-hover:block">
        <div className="min-w-[180px] rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          {item.children.map((c) => (
            <Link
              key={c.href + c.label}
              href={c.href}
              className="block px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const items: NavItem[] = superNoActing
    ? [
        { label: "Félög", href: "/dashboard/companies" },
        { label: "Ofurnotendur", href: "/dashboard/supers" },
      ]
    : isSuper
    ? [
        ...nav,
        { label: "Félög", href: "/dashboard/companies" },
        { label: "Ofurnotendur", href: "/dashboard/supers" },
      ]
    : nav;

  return (
    <div className="min-h-screen">
      <SuperGuard active={superNoActing} />
      {isSuper && <ActingBanner />}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-1.5">
          <span className="font-semibold text-brand">Tímaverk</span>
          <nav className="flex flex-1 flex-wrap items-center gap-5 text-sm">
            {items.map((n) => (
              <NavEntry key={n.href + n.label} item={n} />
            ))}
          </nav>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
