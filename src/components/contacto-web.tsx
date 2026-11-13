import { AtSign, ExternalLink, MessageCircle } from "lucide-react";
import { telLegible } from "@/lib/mensajes";
import type { Empresa } from "@/lib/tipos";

const REDES: [keyof NonNullable<Empresa["redes"]>, string][] = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
];

/** WhatsApp, correo y redes que publica la empresa en su web (o que vinieron en una lista externa). */
export function ContactoWeb({ empresa, compacto = false }: { empresa: Pick<Empresa, "whatsapp" | "correo" | "redes" | "web" | "web_leida">; compacto?: boolean }) {
  const redes = REDES.filter(([k]) => empresa.redes?.[k]);
  const nada = !empresa.whatsapp && !empresa.correo && !redes.length;
  if (nada) {
    if (compacto || !empresa.web) return null;
    return <p className="text-xs text-muted-foreground">{empresa.web_leida ? "Su web no publica WhatsApp, correo ni redes." : "Su web se lee en los próximos minutos."}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {empresa.whatsapp && (
        <a
          href={`https://wa.me/${empresa.whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-whatsapp/12 px-2.5 py-0.5 font-medium text-whatsapp hover:bg-whatsapp/20"
          title="WhatsApp publicado en su web"
        >
          <MessageCircle className="size-3.5" /> {telLegible(empresa.whatsapp)}
        </a>
      )}
      {empresa.correo && (
        <a href={`mailto:${empresa.correo}`} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 hover:bg-muted/70">
          <AtSign className="size-3.5 text-muted-foreground" /> {empresa.correo}
        </a>
      )}
      {redes.map(([k, nombre]) => (
        <a
          key={k}
          href={empresa.redes![k]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-muted/70"
        >
          {nombre} <ExternalLink className="size-3 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}

/** Nombre legible del origen de una empresa. */
export function origenLegible(origen: string | null) {
  if (!origen) return "—";
  if (origen === "manual") return "Agregada a mano";
  if (origen === "ariel") return "Lista de Ariel";
  return `Búsqueda ${origen}`;
}
