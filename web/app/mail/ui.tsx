"use client";

// Sameiginlegir útlitsíhlutir fyrir skilaboðahlutann.

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

export function Avatar({ name }: { name: string }) {
  const initials = name
    .replace(/<.*>/, "")
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${color}`}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

export function niceDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Í gær";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("is-IS", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("is-IS");
}

export function TestBadge() {
  return (
    <span className="inline-block rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
      Prófunargögn
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon}
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-[240px] text-sm text-slate-500">{text}</p>}
    </div>
  );
}
