"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { readEmail, replyToEmail } from "@/lib/mail/service";
import type { InboundEmail } from "@/lib/mail/types";
import { Avatar, TestBadge } from "../ui";

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
      setNotice("Svarið var sent og er sýnilegt undir Sent.");
      setReplying(false);
      setReplyBody("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Villa við sendingu.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white/70" />;
  }
  if (!email) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/60">
        <p className="font-semibold text-slate-700">Skeyti fannst ekki</p>
        <button onClick={() => router.push("/mail")} className="mt-3 font-medium text-brand">
          ← Til baka í innhólf
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/mail"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Innhólf
      </Link>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
        <div className="border-b border-slate-100 p-5">
          <h1 className="text-lg font-bold leading-snug text-slate-900">
            {email.subject || "(ekkert efni)"}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={email.sender_name || email.sender_email} />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">
                {email.sender_name || email.sender_email}
              </p>
              <p className="truncate text-xs text-slate-400">
                {email.sender_email} ·{" "}
                {new Date(email.received_at).toLocaleString("is-IS", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          {email.is_test && (
            <div className="mt-3">
              <TestBadge />
            </div>
          )}
        </div>

        <div className="p-5">
          {email.body_html ? (
            // body_html er hreinsað (sanitize-html) við móttöku í webhook
            <div
              className="prose prose-sm max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: email.body_html }}
            />
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
              {email.body_text}
            </p>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {replying ? (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Svar til {email.sender_email}
          </p>
          <textarea
            autoFocus
            rows={5}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] outline-none focus:border-brand focus:bg-white"
            placeholder="Skrifaðu svar…"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={sendReply}
              disabled={busy || !replyBody.trim()}
              className="flex-1 rounded-xl bg-brand py-3.5 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? "Sendi…" : "Senda svar"}
            </button>
            <button
              onClick={() => setReplying(false)}
              className="rounded-xl border border-slate-200 px-4 py-3.5 font-medium text-slate-600"
            >
              Hætta
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setReplying(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-[17px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 17 4 12l5-5 M4 12h12a4 4 0 0 1 4 4v4" />
          </svg>
          Svara
        </button>
      )}
    </div>
  );
}
