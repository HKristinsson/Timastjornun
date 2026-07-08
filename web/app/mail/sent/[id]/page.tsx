"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { readSent, listAttachments, getAttachmentUrl } from "@/lib/mail/service";
import type { OutboundEmail, EmailAttachment } from "@/lib/mail/types";
import { Avatar } from "../../ui";

interface AttachmentView extends EmailAttachment {
  url: string | null;
}

const STATUS: Record<string, string> = {
  queued: "Í bið",
  sent: "Sent",
  mock_sent: "Sent (prófun)",
  failed: "Mistókst",
};

export default function SentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [email, setEmail] = useState<OutboundEmail | null>(null);
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readSent(id)
      .then(setEmail)
      .finally(() => setLoading(false));

    listAttachments({ outboundId: id })
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

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-white/70" />;
  if (!email) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/60">
        <p className="font-semibold text-slate-700">Skeyti fannst ekki</p>
        <button onClick={() => router.push("/mail?box=sent")} className="mt-3 font-medium text-brand">
          ← Til baka í úthólf
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/mail?box=sent"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Úthólf
      </Link>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
        <div className="border-b border-slate-100 p-5">
          <h1 className="text-lg font-bold leading-snug text-slate-900">
            {email.subject || "(ekkert efni)"}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={email.to_email} />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">Til: {email.to_email}</p>
              <p className="truncate text-xs text-slate-400">
                {STATUS[email.status] ?? email.status} ·{" "}
                {new Date(email.sent_at ?? email.created_at).toLocaleString("is-IS", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
            {email.body_text}
          </p>
        </div>

        {attachments.length > 0 && (
          <div className="border-t border-slate-100 p-5">
            <p className="mb-3 text-sm font-semibold text-slate-700">
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
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <span className="truncate text-sm font-medium text-slate-800">
                      {a.filename}
                    </span>
                  </a>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
