"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { readEmail, replyToEmail } from "@/lib/mail/service";
import type { InboundEmail } from "@/lib/mail/types";

export default function ReadEmailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<InboundEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    readEmail(id)
      .then(setEmail)
      .finally(() => setLoading(false));
  }, [id]);

  async function sendReply() {
    if (!email || !replyBody.trim()) return;
    setBusy(true);
    try {
      await replyToEmail(
        email.id,
        email.sender_email,
        `Re: ${email.subject ?? ""}`,
        replyBody.trim()
      );
      setNotice("Svar vistað í Sent.");
      setReplying(false);
      setReplyBody("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Villa við sendingu.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-slate-400">Hleð…</p>;
  if (!email) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="font-medium text-slate-700">Skeyti fannst ekki</p>
        <button onClick={() => router.push("/mail")} className="mt-3 text-brand">
          ← Til baka í innhólf
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/mail" className="text-sm text-slate-500">
        ← Innhólf
      </Link>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold">{email.subject || "(ekkert efni)"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Frá: <span className="font-medium">{email.sender_name || email.sender_email}</span>
        </p>
        <p className="text-xs text-slate-400">
          {new Date(email.received_at).toLocaleString("is-IS")}
        </p>
        {email.is_test && (
          <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            PRÓFUNARGÖGN
          </span>
        )}

        <hr className="my-4 border-slate-100" />

        {email.body_html ? (
          // body_html er hreinsað (sanitize-html) við móttöku í webhook
          <div
            className="prose prose-sm max-w-none text-slate-800"
            dangerouslySetInnerHTML={{ __html: email.body_html }}
          />
        ) : (
          <p className="whitespace-pre-wrap text-slate-800">{email.body_text}</p>
        )}
      </div>

      {notice && (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</div>
      )}

      {replying ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium">Svar til {email.sender_email}</p>
          <textarea
            autoFocus
            rows={5}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm"
            placeholder="Skrifaðu svar…"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={sendReply}
              disabled={busy || !replyBody.trim()}
              className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Sendi…" : "Senda svar"}
            </button>
            <button
              onClick={() => setReplying(false)}
              className="rounded-xl border border-slate-300 px-4 py-3"
            >
              Hætta
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setReplying(true)}
          className="w-full rounded-xl bg-brand py-4 text-lg font-semibold text-white"
        >
          ↩️ Svara
        </button>
      )}
    </div>
  );
}
