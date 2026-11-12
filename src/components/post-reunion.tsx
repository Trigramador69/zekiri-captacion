"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarCheck2, CalendarPlus, Copy, ExternalLink, Loader2, Video } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarEnlaceReunion, type Resultado } from "@/app/acciones";
import { enlaceCalendario, esVirtual, type DatosReunion } from "@/lib/mensajes";
import { toast } from "sonner";

/*
 * Paso siguiente a agendar una reunión (crear en Google Calendar y pegar el enlace de Meet).
 * Vive fuera de la vista que lo abrió: aunque el contacto cambie de lista o de estado, el diálogo sigue abierto.
 */

type Datos = DatosReunion & { reprogramada?: boolean; calendario_url?: string | null; evento_nuevo?: boolean };
let oyentes: ((d: Datos) => void)[] = [];

export function mostrarPostReunion(d: Datos) {
  oyentes.forEach((f) => f(d));
}

export function PostReunionHost() {
  const [d, setD] = useState<Datos | null>(null);
  const [enlace, setEnlace] = useState("");
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    const f = (x: Datos) => {
      setD(x);
      setEnlace(x.enlace_reunion ?? "");
    };
    oyentes.push(f);
    return () => {
      oyentes = oyentes.filter((g) => g !== f);
    };
  }, []);

  if (!d) return null;
  const virtual = esVirtual(d.modalidad_reunion);

  // Google conectado: el evento (y el Meet) ya se crearon solos.
  if (d.calendario_url) {
    return (
      <Dialog open onOpenChange={(v) => !v && setD(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{d.reprogramada ? "Reunión reprogramada" : "¡Reunión agendada!"}</DialogTitle>
            <DialogDescription>
              {d.evento_nuevo || !d.reprogramada ? "Se creó el evento en tu Google Calendar" : "Se movió el evento en tu Google Calendar"}
              {d.correo ? ` y se invitó a ${d.correo}` : ""}.{" "}
              {virtual && d.enlace_reunion ? "1 hora antes te llega un correo con el botón de WhatsApp y el mensaje con este enlace, listo para enviar." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-success/10 p-3 text-sm">
              <CalendarCheck2 className="size-5 shrink-0 text-success" />
              <span className="flex-1">Evento en tu calendario</span>
              <Button size="sm" variant="ghost" asChild>
                <a href={d.calendario_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Ver
                </a>
              </Button>
            </div>
            {d.enlace_reunion && (
              <div className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                <Video className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{d.enlace_reunion}</span>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(d.enlace_reunion ?? "").then(() => toast.success("Enlace copiado"))}>
                  <Copy /> Copiar
                </Button>
              </div>
            )}
            {!d.correo && <p className="text-xs text-muted-foreground">Si tienes el correo del gerente, agrégalo en su contacto y reprograma para que le llegue la invitación.</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => setD(null)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  const guardar = (cerrar: boolean) =>
    iniciar(async () => {
      const r: Resultado = await guardarEnlaceReunion(d.contacto_id, enlace);
      if (!r.ok) toast.error(r.error ?? "No se pudo guardar");
      else {
        toast.success(r.mensaje ?? "Enlace guardado");
        if (cerrar) setD(null);
      }
    });

  return (
    <Dialog open onOpenChange={(v) => !v && setD(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{d.reprogramada ? "Reunión reprogramada" : "¡Reunión agendada!"}</DialogTitle>
          <DialogDescription>
            {virtual
              ? "1. Créala en Google Calendar y agrega el Meet con un clic. 2. Pega el enlace aquí: se manda solo 1 hora antes."
              : "Agrégala a tu Google Calendar para tenerla en tu agenda."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Button asChild size="lg" className="h-11 w-full">
            <a href={enlaceCalendario({ ...d, enlace_reunion: enlace || null })} target="_blank" rel="noopener noreferrer">
              <CalendarPlus /> Crear en Google Calendar
            </a>
          </Button>
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Para que el evento y el Meet se creen solos, conecta tu cuenta de Google en{" "}
            <Link href="/config?tab=integraciones" className="font-medium underline" onClick={() => setD(null)}>
              Configuración → Integraciones
            </Link>
            .
          </p>
          {virtual && (
            <div className="space-y-2">
              <Label htmlFor="enlace-reunion">Enlace de {d.modalidad_reunion}</Label>
              <Input id="enlace-reunion" value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://meet.google.com/…" />
              <p className="text-xs text-muted-foreground">En Calendar: «Agregar videoconferencia de Google Meet» → copia el enlace del evento.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setD(null)}>
            {virtual ? "Después" : "Listo"}
          </Button>
          {virtual && (
            <Button disabled={!enlace.trim() || enlace === (d.enlace_reunion ?? "") || pendiente} onClick={() => guardar(true)}>
              {pendiente && <Loader2 className="animate-spin" />} Guardar enlace
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
