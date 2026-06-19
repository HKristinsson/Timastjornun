"use client";

import { useState, useTransition } from "react";
import { approveEntry, rejectEntry } from "@/app/dashboard/time-entries/actions";

export default function ReviewActions({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  if (rejecting) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ástæða höfnunar"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          disabled={pending || reason.trim() === ""}
          onClick={() =>
            startTransition(async () => {
              await rejectEntry(id, reason.trim());
              setRejecting(false);
              setReason("");
            })
          }
          className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          Staðfesta
        </button>
        <button
          onClick={() => setRejecting(false)}
          className="text-xs text-slate-500"
        >
          Hætta
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => startTransition(() => approveEntry(id))}
        className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50"
      >
        Samþykkja
      </button>
      <button
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600"
      >
        Hafna
      </button>
    </div>
  );
}
