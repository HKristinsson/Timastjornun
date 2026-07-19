"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  sendEmail,
  uploadAttachment,
  addOutboundAttachment,
  splitRecipients,
  readEmail,
  listCompanyUsers,
} from "@/lib/mail/service";
import type { CompanyUser } from "@/lib/mail/types";

const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[15px] outline-none focus:border-brand focus:bg-white";

interface Pending {
  file: File;
  preview: string | null; // data-URL fyrir myndir
}

export default function ComposePage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white/70" />}>
      <ComposeInner />
    </Suspense>
  );
}

function ComposeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forwardId = searchParams.get("fwd");
  const [to, setTo] = useState("");
  const [colleagues, setColleagues] = useState<CompanyUser[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Samstarfsmenn félagsins í viðtakendalista
  useEffect(() => {
    listCompanyUsers().then(setColleagues).catch(() => {});
  }, []);

  function togglePicked(email: string) {
    setPicked((p) =>
      p.includes(email) ? p.filter((e) => e !== email) : [...p, email]
    );
  }

  // Áframsending: forfylla efni og texta úr upprunalega skeytinu
  useEffect(() => {
    if (!forwardId) return;
    readEmail(forwardId)
      .then((orig) => {
        if (!orig) return;
        setSubject((s) => s || `Fwd: ${orig.subject ?? ""}`);
        setBody(
          (b) =>
            b ||
            `\n\n---------- Áframsent skeyti ----------\nFrá: ${
              orig.sender_name || orig.sender_email
            } <${orig.sender_email}>\nDags: ${new Date(orig.received_at).toLocaleString(
              "is-IS"
            )}\nEfni: ${orig.subject ?? ""}\n\n${orig.body_text ?? ""}`
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forwardId]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    for (const file of Array.from(list)) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`„${file.name}" er yfir 10 MB hámarkinu.`);
        continue;
      }
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () =>
          setAttachments((a) => [...a, { file, preview: reader.result as string }]);
        reader.readAsDataURL(file);
      } else {
        setAttachments((a) => [...a, { file, preview: null }]);
      }
    }
  }

  async function send() {
    setError(null);
    const recipients = Array.from(
      new Set([...picked, ...splitRecipients(to)])
    );
    if (recipients.length === 0) {
      setError("Sláðu inn a.m.k. eitt gilt netfang.");
      return;
    }
    setBusy(true);
    try {
      // 1) Hlaða viðhengjum upp (einu sinni — sömu skrár fyrir alla viðtakendur)
      const uploaded: { file: File; path: string }[] = [];
      for (let i = 0; i < attachments.length; i++) {
        setProgress(`Hleð upp viðhengi ${i + 1} af ${attachments.length}…`);
        const path = await uploadAttachment(attachments[i].file);
        uploaded.push({ file: attachments[i].file, path });
      }
      // 2) Senda á hvern viðtakanda
      for (let i = 0; i < recipients.length; i++) {
        setProgress(
          recipients.length > 1
            ? `Sendi ${i + 1} af ${recipients.length}…`
            : "Sendi skeyti…"
        );
        const sent = await sendEmail(recipients[i], subject.trim(), body.trim());
        for (const u of uploaded) {
          await addOutboundAttachment(sent.id, u.file, u.path);
        }
      }
      // Eftir sendingu: beint í innhólfið
      router.push("/mail");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Villa við sendingu.");
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold tracking-tight">Nýtt skeyti</h1>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Til</label>

          {/* Valdir viðtakendur af lista */}
          {picked.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {picked.map((email) => {
                const c = colleagues.find((x) => x.email === email);
                return (
                  <button
                    key={email}
                    type="button"
                    onClick={() => togglePicked(email)}
                    className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1.5 text-[13px] font-semibold text-brand"
                  >
                    {c?.full_name ?? email}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M18 6 6 18 M6 6l12 12" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}

          {colleagues.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="mb-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {showPicker ? "Fela lista" : "Velja af lista samstarfsmanna"}
            </button>
          )}

          {showPicker && (
            <div className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {colleagues.map((c, i) => {
                const on = picked.includes(c.email);
                return (
                  <button
                    key={c.email}
                    type="button"
                    onClick={() => togglePicked(c.email)}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                      i > 0 ? "border-t border-slate-100" : ""
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"
                      }`}
                    >
                      {on && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {c.full_name}
                      </span>
                      <span className="block truncate text-xs text-slate-400">{c.email}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="…eða skrifaðu netfang: netfang@daemi.is"
            className={field}
          />
          <p className="mt-1 text-xs text-slate-400">
            Veldu samstarfsmenn af listanum og/eða skrifaðu netföng — margir
            viðtakendur aðskildir með kommu eða semíkommu.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Efni</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Skeyti</label>
          <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} className={field} />
        </div>

        {/* Viðhengi */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">
            Viðhengi
          </label>

          {attachments.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  {a.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.preview} alt={a.file.name} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 flex-col items-center justify-center gap-1 px-2">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M13 2v7h7" />
                      </svg>
                      <span className="w-full truncate text-center text-[10px] text-slate-500">
                        {a.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                    aria-label={`Fjarlægja ${a.file.name}`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-white"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M18 6 6 18 M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Taka mynd
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              Velja skrá
            </button>
          </div>
          {/* Myndavél símans opnast beint (capture) */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <button
          onClick={send}
          disabled={busy || (picked.length === 0 && !to.trim()) || !body.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13 M22 2 15 22l-4-9-9-4z" />
          </svg>
          {busy ? progress ?? "Sendi…" : "Senda"}
        </button>
      </div>
    </div>
  );
}
