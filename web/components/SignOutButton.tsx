"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }
  return (
    <button
      onClick={signOut}
      className="text-sm text-slate-500 hover:text-red-600"
    >
      Útskrá
    </button>
  );
}
