import { ESTADOS, ESTADOS_EMPRESA, EVENTOS_EXTRA, TONO_CLASES } from "@/lib/constantes";
import { cn } from "@/lib/utils";

export function Pagina({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8", className)}>{children}</main>;
}

export function Encabezado({ titulo, descripcion, children }: { titulo: string; descripcion?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function EstadoBadge({ estado, className }: { estado: string; className?: string }) {
  const e = ESTADOS[estado];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONO_CLASES[e?.tono ?? "neutro"], className)}>
      {e?.etiqueta ?? estado}
    </span>
  );
}

/** Etiqueta de un evento del historial (estado nuevo o acción como «Seguimiento enviado»). */
export function EventoBadge({ evento }: { evento: string }) {
  if (ESTADOS[evento]) return <EstadoBadge estado={evento} />;
  const x = EVENTOS_EXTRA[evento];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONO_CLASES[x?.tono ?? "neutro"])}>
      {x?.etiqueta ?? evento.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

export function EstadoEmpresaBadge({ estado }: { estado: string }) {
  const tono = estado === "EN_CURSO" ? "info" : estado === "LISTA" ? "exito" : estado === "NO_CONTACTAR" ? "peligro" : estado === "DESCARTADA" ? "apagado" : "neutro";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TONO_CLASES[tono])}>{ESTADOS_EMPRESA[estado] ?? estado}</span>;
}

export function Prioridad({ valor, className }: { valor: string; className?: string }) {
  if (!valor) return null;
  const clases: Record<string, string> = {
    A: "bg-primary text-primary-foreground",
    B: "bg-primary/15 text-primary",
    C: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex size-6 items-center justify-center rounded-md text-xs font-bold", clases[valor], className)} title={`Prioridad ${valor}`}>
      {valor}
    </span>
  );
}

export function Vacio({ icono: Icono, titulo, children }: { icono: React.ComponentType<{ className?: string }>; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icono className="size-6" />
      </span>
      <h3 className="text-base font-semibold">{titulo}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Kpi({ etiqueta, valor, detalle, className }: { etiqueta: string; valor: React.ReactNode; detalle?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}
