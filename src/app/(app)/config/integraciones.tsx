"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck2, CheckCircle2, Clock, Loader2, Mail, Plug, Play, Save, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avisar } from "@/components/dialogos-contacto";
import { desconectarGoogle, ejecutarTareasAhora, guardarConfig } from "@/app/acciones";
import { cn } from "@/lib/utils";

type Props = {
  configurado: boolean;
  correo: string | null;
  conexion: { email: string; actualizado: string } | null;
  ultimaEjecucion: { enviado: string; detalle: string | null } | null;
  config: Record<string, string>;
  estadoUrl?: string;
};

const MENSAJES: Record<string, [string, "ok" | "error"]> = {
  ok: ["Cuenta de Google conectada. Desde ahora las reuniones se crean solas en tu calendario con Meet.", "ok"],
  cancelado: ["Cancelaste la conexión con Google.", "error"],
  error: ["No se pudo conectar con Google. Vuelve a intentar.", "error"],
  permisos_incompletos: ["Falta el permiso de Calendar: al conectar, marca la casilla de Google Calendar.", "error"],
  sin_configurar: ["Falta configurar las credenciales de Google en el servidor (ver guía).", "error"],
};

const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

export function Integraciones({ configurado, correo, conexion, ultimaEjecucion, config, estadoUrl }: Props) {
  const [v, setV] = useState({
    correo_avisos: config.correo_avisos ?? "",
    aviso_resumen_hora: config.aviso_resumen_hora ?? "08:30",
    aviso_reunion_minutos: config.aviso_reunion_minutos ?? "60",
    aviso_reporte_semanal: config.aviso_reporte_semanal ?? "SI",
    busquedas_auto_semana: config.busquedas_auto_semana ?? "3",
  });
  const [pendiente, iniciar] = useTransition();
  const [corriendo, setCorriendo] = useState<string | null>(null);

  useEffect(() => {
    if (!estadoUrl || !MENSAJES[estadoUrl]) return;
    const [m, t] = MENSAJES[estadoUrl];
    if (t === "ok") toast.success(m);
    else toast.error(m);
  }, [estadoUrl]);

  const correr = (que: string, forzar: string[]) => {
    setCorriendo(que);
    iniciar(async () => {
      avisar(await ejecutarTareasAhora(forzar));
      setCorriendo(null);
    });
  };

  const relojActivo = ultimaEjecucion && Date.now() - new Date(ultimaEjecucion.enviado).getTime() < 40 * 60000;

  return (
    <div className="space-y-6">
      {/* Google */}
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarCheck2 className="size-5" />
            </span>
            <div>
              <h3 className="font-semibold">Google Calendar</h3>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Al agendar una reunión se crea el evento en tu calendario con su Meet y se invita al gerente. Al reprogramar se mueve, y si la reunión se cae, se cancela.
              </p>
              {conexion ? (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-success/12 px-3 py-1 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" /> Conectado como {conexion.email}
                </p>
              ) : !configurado ? (
                <p className="mt-3 rounded-lg bg-warning/15 px-3 py-2 text-sm">Falta configurar las credenciales de Google en el servidor (paso 4 de la guía de la web).</p>
              ) : null}
            </div>
          </div>
          {conexion ? (
            <Button variant="outline" disabled={pendiente} onClick={() => iniciar(async () => void avisar(await desconectarGoogle()))}>
              <Unplug /> Desconectar
            </Button>
          ) : (
            <Button asChild disabled={!configurado} className={cn(!configurado && "pointer-events-none opacity-50")}>
              <a href="/api/google/conectar">
                <Plug /> Conectar con Google
              </a>
            </Button>
          )}
        </div>
      </section>

      {/* Avisos */}
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="mb-4 flex gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Avisos por correo</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se envían solos, aunque no abras la web{correo ? `, desde ${correo}` : ""}.
            </p>
            {!correo && <p className="mt-2 rounded-lg bg-warning/15 px-3 py-2 text-sm">Falta configurar el correo de Zoho (SMTP) en el servidor: paso 5 de la guía.</p>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Enviar los avisos a</Label>
            <Input value={v.correo_avisos} onChange={(e) => setV({ ...v, correo_avisos: e.target.value })} placeholder={correo ?? "tu correo"} />
            <p className="text-xs text-muted-foreground">Vacío = al mismo correo que los envía.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Resumen del día (días hábiles)</Label>
            <Input type="time" value={v.aviso_resumen_hora} onChange={(e) => setV({ ...v, aviso_resumen_hora: e.target.value })} />
            <p className="text-xs text-muted-foreground">Seguimientos, nuevos, respuestas y reuniones del día. Vacío = no enviar.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Aviso antes de cada reunión (minutos)</Label>
            <Input type="number" min={0} max={240} value={v.aviso_reunion_minutos} onChange={(e) => setV({ ...v, aviso_reunion_minutos: e.target.value })} />
            <p className="text-xs text-muted-foreground">Con el botón de WhatsApp y el enlace listos. 0 = no avisar.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Reporte de la semana anterior</Label>
            <select
              value={v.aviso_reporte_semanal}
              onChange={(e) => setV({ ...v, aviso_reporte_semanal: e.target.value })}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="SI">Sí, los lunes con el resumen</option>
              <option value="NO">No</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Búsquedas automáticas por semana</Label>
            <Input type="number" min={0} max={10} value={v.busquedas_auto_semana} onChange={(e) => setV({ ...v, busquedas_auto_semana: e.target.value })} />
            <p className="text-xs text-muted-foreground">Corren el domingo a la noche (las que hace más tiempo no se buscan). Cada una usa hasta 3 de tus 1.000 solicitudes gratis al mes.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button disabled={pendiente} onClick={() => iniciar(async () => void avisar(await guardarConfig(v)))}>
            {pendiente && !corriendo ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
          <Button variant="outline" disabled={pendiente || !correo} onClick={() => correr("resumen", ["resumen"])}>
            {corriendo === "resumen" ? <Loader2 className="animate-spin" /> : <Mail />} Enviarme el resumen ahora
          </Button>
        </div>
      </section>

      {/* Reloj */}
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", relojActivo ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
              <Clock className="size-5" />
            </span>
            <div>
              <h3 className="font-semibold">Tareas programadas (n8n)</h3>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                n8n despierta al sistema cada 15 minutos: cierra contactos vencidos, manda los avisos y corre las búsquedas de los domingos. «Ejecutar ahora» hace lo
                mismo a mano, sin necesitar n8n.
              </p>
              <p className="mt-2 text-sm">
                {ultimaEjecucion ? (
                  <>
                    Última ejecución: <b>{hace(ultimaEjecucion.enviado)}</b>
                    {!relojActivo && " · n8n no la está llamando (se activa al publicar la web e importar el flujo F7)"}
                  </>
                ) : (
                  "Todavía no corrió nunca. Se activa al publicar la web e importar el flujo F7 en n8n."
                )}
              </p>
            </div>
          </div>
          <Button variant="outline" disabled={pendiente} onClick={() => correr("todo", [])}>
            {corriendo === "todo" ? <Loader2 className="animate-spin" /> : <Play />} Ejecutar ahora
          </Button>
        </div>
      </section>
    </div>
  );
}
