"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck2, CalendarPlus, Copy, Link2, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogoReunion, avisar } from "@/components/dialogos-contacto";
import { ResultadoReunion } from "@/components/resultado-reunion";
import { guardarEnlaceReunion } from "@/app/acciones";
import { enlaceCalendario, esVirtual, horaAviso, horaBolivia24, varsReunion, type DatosReunion } from "@/lib/mensajes";
import { cn } from "@/lib/utils";

export function BotonCalendario({ r, size = "sm", className, soloIcono = false }: { r: DatosReunion; size?: "sm" | "default"; className?: string; soloIcono?: boolean }) {
  if (!r.fecha_reunion) return null;
  // Si el evento ya se creó solo, se abre ese; si no, se ofrece crearlo.
  const existe = Boolean(r.evento_google_url);
  const titulo = existe ? "Ver en Google Calendar" : "Agregar a Google Calendar";
  return (
    <Button size={soloIcono ? "icon-sm" : size} variant="outline" asChild className={className} title={titulo}>
      <a href={existe ? r.evento_google_url! : enlaceCalendario(r)} target="_blank" rel="noopener noreferrer" aria-label={titulo}>
        {existe ? <CalendarCheck2 /> : <CalendarPlus />} {!soloIcono && (existe ? "Ver en Calendar" : "Google Calendar")}
      </a>
    </Button>
  );
}

/** Todo lo de una reunión agendada en un solo bloque: cuándo, enlace, Calendar, reprogramar y resultado. */
export function PanelReunion({ r, responsables, compacto = false }: { r: DatosReunion; responsables: string[]; compacto?: boolean }) {
  const [enlace, setEnlace] = useState(r.enlace_reunion ?? "");
  const [pendiente, iniciar] = useTransition();
  if (!r.fecha_reunion) return null;
  const v = varsReunion(r);
  const virtual = esVirtual(r.modalidad_reunion);
  const pasada = new Date(r.fecha_reunion).getTime() < Date.now();
  return (
    <div className={cn("space-y-3 rounded-xl border border-success/40 bg-success/[0.06] p-4", compacto && "p-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm">
          <p className="font-semibold first-letter:uppercase">
            {v.dia} · {horaBolivia24(r.fecha_reunion)}
          </p>
          <p className="text-muted-foreground">
            {v.modalidad} · responsable {r.responsable_reunion ?? "-"}
            {!pasada && virtual && ` · enviar el enlace a las ${horaAviso(r.fecha_reunion)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonCalendario r={{ ...r, enlace_reunion: enlace || null }} />
          <DialogoReunion
            contactoId={r.contacto_id}
            responsables={responsables}
            inicial={{ fecha_reunion: r.fecha_reunion, modalidad_reunion: r.modalidad_reunion, responsable_reunion: r.responsable_reunion, enlace_reunion: enlace }}
            datos={r}
            disparador={
              <Button size="sm" variant="ghost">
                Reprogramar
              </Button>
            }
          />
          {pasada && <ResultadoReunion contactoId={r.contacto_id} />}
        </div>
      </div>
      {virtual && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Video className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={enlace}
              onChange={(e) => setEnlace(e.target.value)}
              placeholder={`Pega el enlace de ${r.modalidad_reunion} (se manda 1 h antes)`}
              className="h-9 bg-background pl-8"
            />
          </div>
          {enlace !== (r.enlace_reunion ?? "") ? (
            <Button size="sm" className="h-9" disabled={pendiente} onClick={() => iniciar(async () => void avisar(await guardarEnlaceReunion(r.contacto_id, enlace)))}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Link2 />} Guardar
            </Button>
          ) : (
            enlace && (
              <Button size="sm" variant="ghost" className="h-9" onClick={() => navigator.clipboard?.writeText(enlace).then(() => toast.success("Enlace copiado"))}>
                <Copy /> Copiar
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
