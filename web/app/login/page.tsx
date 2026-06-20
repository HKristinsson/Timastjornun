"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError("Innskráning mistókst. Athugaðu netfang og lykilorð.");
      return;
    }
    // Beina eftir hlutverki: stjórnendur → stjórnborð, starfsmenn → starfsmanna-app
    const { data: roles } = await supabase.rpc("my_roles");
    const r: string[] = roles ?? [];
    const isManager =
      r.includes("admin") || r.includes("project_manager") || r.includes("payroll");
    router.push(isManager ? "/dashboard" : "/me");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-2xl font-semibold">Tímastjórnun</h1>
        <p className="mb-6 text-sm text-slate-500">Innskráning stjórnenda</p>

        <label className="mb-1 block text-sm font-medium">Netfang</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand"
        />

        <label className="mb-1 block text-sm font-medium">Lykilorð</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "Augnablik…" : "Innskrá"}
        </button>
      </form>
    </main>
  );
}
