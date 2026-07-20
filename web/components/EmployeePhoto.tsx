"use client";

// Mynd starfsmanns: sýna, hlaða upp (stjórnendur) og fjarlægja.
// Geymd í employee-photos fötunni undir <tenant_id>/<employee_id>.jpg —
// aðeins notendur sama félags geta skoðað (RLS á storage).
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "employee-photos";

export default function EmployeePhoto({ employeeId }: { employeeId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("employees")
        .select("photo_path")
        .eq("id", employeeId)
        .single();
      const p = (data as { photo_path: string | null } | null)?.photo_path ?? null;
      setPath(p);
      if (p) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(p, 3600);
        setUrl(signed?.signedUrl ?? null);
      }
    })();
  }, [employeeId]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: tenant } = await supabase.rpc("my_tenant_id");
      if (!tenant) throw new Error("Félag fannst ekki.");
      const newPath = `${tenant}/${employeeId}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, file, {
          contentType: file.type || "image/jpeg",
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);
      const { error: setErr } = await supabase.rpc("employee_set_photo", {
        p_employee_id: employeeId,
        p_path: newPath,
      });
      if (setErr) throw new Error(setErr.message);
      // Eyða gömlu myndinni ef til
      if (path && path !== newPath) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      }
      setPath(newPath);
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(newPath, 3600);
      setUrl(signed?.signedUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Villa við upphlaðningu.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!path) return;
    if (!window.confirm("Fjarlægja mynd starfsmannsins?")) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc("employee_set_photo", {
      p_employee_id: employeeId,
      p_path: null,
    });
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    setPath(null);
    setUrl(null);
    setBusy(false);
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
      <h2 className="text-[15px] font-semibold text-slate-800">Mynd starfsmanns</h2>
      <p className="mt-1 text-sm text-slate-500">
        Myndin sést í stjórnendayfirlitum og á korti — aðeins innan félagsins.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="Mynd starfsmanns"
            className="h-24 w-24 rounded-2xl border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 text-3xl">
            👤
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? "Hleð…" : url ? "Skipta um mynd" : "Hlaða upp mynd"}
          </button>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Fjarlægja
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (f.size > 5 * 1024 * 1024) {
              setError("Myndin er yfir 5 MB hámarkinu.");
            } else {
              upload(f);
            }
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
