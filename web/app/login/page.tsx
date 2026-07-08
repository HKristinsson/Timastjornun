"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/Logo";

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
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        backgroundImage: "url('/marketing/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-sm">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-white/95 p-8 shadow-xl shadow-blue-900/10 ring-1 ring-slate-200/60 backdrop-blur"
        >
          <div className="mb-7 flex flex-col items-center text-center">
            <LogoMark size={56} />
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              Tímaverk
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Skráðu þig inn til að halda áfram
            </p>
          </div>

          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Netfang
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] outline-none transition-colors focus:border-brand focus:bg-white"
          />

          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Lykilorð
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] outline-none transition-colors focus:border-brand focus:bg-white"
          />

          {error && (
            <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand py-3.5 text-[16px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {loading ? "Augnablik…" : "Innskrá"}
          </button>

          <p className="mt-6 text-center text-xs text-slate-400">
            Tímaskráning og skilaboð á einum stað
          </p>
        </form>
      </div>
    </main>
  );
}
