"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Super admin án valins félags má aðeins vera á Félög- og Ofurnotendur-síðum —
// allar aðrar stjórnborðssíður krefjast þess að félag sé valið (Vinna sem).
export default function SuperGuard({ active }: { active: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    if (
      !pathname.startsWith("/dashboard/companies") &&
      !pathname.startsWith("/dashboard/supers")
    ) {
      router.replace("/dashboard/companies");
    }
  }, [active, pathname, router]);

  return null;
}
