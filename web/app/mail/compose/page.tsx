"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmail, uploadAttachment, addOutboundAttachment } from "@/lib/mail/service";

const field =
  "w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[15px] outline-none focus:border-brand focus:bg-white";

interface Pending {
  file: File;
  preview: string | null; // data-URL fyrir myndir
}

export default function ComposePage() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setBusy(true);
    try {
      // 1) Hlaða viðhengjum upp
      const uploaded: { file: File; path: string }[] = [];
      for (let i = 0; i < attachments.length; i++) {
        setProgress(`Hleð upp viðhengi ${i + 1} af ${attachments.length}…`);
        const path = await uploadAttachment(attachments[i].file);
        uploaded.push({ file: attachments[i].file, path });
      }
      // 2) Senda skeytið
      setProgress("Sendi skeyti…");
      const sent = await sendEmail(to.trim(), subject.trim(), body.trim());
      // 3) Tengja viðhengin
      for (const u of uploaded) {
        await addOutboundAttachment(sent.id, u.file, u.path);
      }
      router.push("/mail/sent");
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
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="netfang@daemi.is"
            className={field}
          />
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
          disabled={busy || !to.trim() || !body.trim()}
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
