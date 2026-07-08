"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { readEmail, replyToEmail, listAttachments, getAttachmentUrl } from "@/lib/mail/service";
import type { InboundEmail, EmailAttachment } from "@/lib/mail/types";
import { Avatar, TestBadge } from "../ui";

interface AttachmentView extends EmailAttachment {
  url: string | null;
}

export default function ReadEmailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<InboundEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<AttachmentView[]>([]);

  useEffect(() => {
    readEmail(id)
      .then(setEmail)
      .finally(() => setLoading(false));

    // Viðhengi + öruggar slóðir
    listAttachments({ inboundId: id })
      .then(async (list) => {
        const withUrls = await Promise.all(
          list.map(async (a) => ({
            ...a,
            url: a.storage_path
              ? await getAttachmentUrl(a.storage_path).catch(() => null)
              : null,
          }))
        );
        setAttachments(withUrls);
      })
      .catch(() => {});
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

        {attachments.length > 0 && (
          <div className="border-t border-slate-100 p-5">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              Viðhengi ({attachments.length})
            </p>
            <div className="space-y-2">
              {attachments.map((a) =>
                a.url && a.content_type?.startsWith("image/") ? (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.url}
                      alt={a.filename}
                      className="max-h-72 w-full rounded-xl border border-slate-200 object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={a.id}
                    href={a.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition-colors hover:bg-slate-100"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M13 2v7h7" />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {a.filename}
                      </span>
                      {a.size_bytes != null && (
                        <span className="text-xs text-slate-400">
                          {Math.max(1, Math.round(a.size_bytes / 1024))} KB
                        </span>
                      )}
                    </span>
                  </a>
                )
              )}
            </div>
          </div>
        )}
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
