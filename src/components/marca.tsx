import { cn } from "@/lib/utils";

export function Marca({ className, compacta = false }: { className?: string; compacta?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#12304a" />
        <path d="M20 20h24L22 44h24" fill="none" stroke="#5fd3ef" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compacta && (
        <span className="leading-none">
          Zékiri
          <span className="block text-[11px] font-medium tracking-normal opacity-60">Captación</span>
        </span>
      )}
    </span>
  );
}
