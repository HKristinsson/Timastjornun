// Tímaverk-merki: staðsetningarpinni með klukku + orðmerki.
export function LogoMark({ size = 32, color = "#2563eb" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="15" fill={color} />
      <path
        d="M32 13 C24.3 13 18 19 18 26.4 C18 35 32 49 32 49 C32 49 46 35 46 26.4 C46 19 39.7 13 32 13 Z"
        fill="#ffffff"
      />
      <circle cx="32" cy="26" r="8.5" fill={color} />
      <line x1="32" y1="26" x2="32" y2="20.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <line x1="32" y1="26" x2="36" y2="28.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={30} color={light ? "#ffffff" : "#2563eb"} />
      <span
        className={`text-xl font-semibold tracking-tight ${
          light ? "text-white" : "text-slate-900"
        }`}
      >
        Tímaverk
      </span>
    </span>
  );
}
