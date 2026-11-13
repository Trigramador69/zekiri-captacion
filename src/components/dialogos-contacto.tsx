"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarCheck, Loader2, MessageSquareReply, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { agendarReunion, cambiarEstado, gerenteConseguido, registrarRespuesta, type Resultado } from "@/app/acciones";
import { mostrarPostReunion } from "@/components/post-reunion";
import { OBJECIONES } from "@/lib/constantes";

function avisar(r: Resultado, ok?: string) {
  if (!r.ok) toast.error(r.error ?? "No se pudo guardar");
  else {
    toast.success(r.mensaje ?? ok ?? "Listo");
    r.avisos?.forEach((a) => toast.warning(a));
  }
  return r.ok;
}

type Disparador = React.ReactNode;

export function DialogoRespuesta({ contactoId, disparador, alTerminar }: { contactoId: string; disparador?: Disparador; alTerminar?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [objecion, setObjecion] = useState<string>("");
  const [pendiente, iniciar] = useTransition();
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {disparador ?? (
          <Button variant="outline">
            <MessageSquareReply /> Respondió
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar respuesta</DialogTitle>
          <DialogDescription>Pega lo que respondieron. Si piden no recibir más mensajes, el contacto pasa solo a No contactar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea autoFocus rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Hola, sí, ¿de qué se trata?" />
          <div className="space-y-2">
            <Label>Objeción (opcional)</Label>
            <Select value={objecion} onValueChange={setObjecion}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin objeción" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(OBJECIONES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!texto.trim() || pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await registrarRespuesta(contactoId, texto.trim(), objecion || undefined);
                if (avisar(r)) {
                  setAbierto(false);
                  setTexto("");
                  alTerminar?.();
                  if (objecion === "no_interesa" && !r.mensaje?.includes("No contactar")) {
                    toast("¿Lo cierras como perdido?", {
                      description: "Dijo que no le interesa. Si respondes con la plantilla «No le interesa», hazlo antes de cerrarlo.",
                      duration: 12000,
                      action: { label: "Cerrar como perdido", onClick: async () => void avisar(await cambiarEstado(contactoId, "PERDIDO", "No le interesa"), "Cerrado como perdido") },
                    });
                  }
                }
              })
            }
          >
            {pendiente && <Loader2 className="animate-spin" />} Guardar respuesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoGerente({
  contactoId,
  nombreRecepcion,
  disparador,
  alTerminar,
}: {
  contactoId: string;
  nombreRecepcion?: string | null;
  disparador?: Disparador;
  /** Recibe el ID del contacto nuevo del gerente. */
  alTerminar?: (nuevoId?: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ nombre: "", cargo: "", telefono: "", correo: "", canal: "WhatsApp", nombreRecepcion: nombreRecepcion ?? "" });
  const [pendiente, iniciar] = useTransition();
  const campo = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }) });
  const valido = d.nombre.trim() && (d.canal === "WhatsApp" ? d.telefono.trim() : d.canal === "correo" ? d.correo.trim() : true);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {disparador ?? (
          <Button variant="outline">
            <UserRoundPlus /> Gerente conseguido
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¡Gerente conseguido!</DialogTitle>
          <DialogDescription>Se crea su contacto con el mensaje listo en la cola de hoy. Escríbele en menos de 24 horas.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Nombre del gerente</Label>
            <Input autoFocus placeholder="Juan Pérez" {...campo("nombre")} />
          </div>
          <div className="space-y-2">
            <Label>Cargo</Label>
            <Input placeholder="Gerente general" {...campo("cargo")} />
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            <Select value={d.canal} onValueChange={(v) => setD({ ...d, canal: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                <SelectItem value="correo">Correo</SelectItem>
                <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                <SelectItem value="llamada">Llamada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Celular</Label>
            <Input inputMode="tel" placeholder="7XXXXXXX" {...campo("telefono")} />
          </div>
          <div className="space-y-2">
            <Label>Correo</Label>
            <Input type="email" placeholder="gerencia@empresa.com" {...campo("correo")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>¿Quién te lo pasó? (recepción)</Label>
            <Input placeholder="Ana" {...campo("nombreRecepcion")} />
            <p className="text-xs text-muted-foreground">Se menciona en el primer mensaje al gerente.</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!valido || pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await gerenteConseguido(contactoId, d);
                if (avisar(r)) {
                  setAbierto(false);
                  alTerminar?.(r.id);
                }
              })
            }
          >
            {pendiente && <Loader2 className="animate-spin" />} Crear contacto del gerente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type InicialReunion = { fecha_reunion: string | null; modalidad_reunion: string | null; responsable_reunion: string | null; enlace_reunion?: string | null };
type DatosCalendario = { nombre?: string | null; cargo?: string | null; correo?: string | null; telefono_e164?: string | null; empresa?: string | null };

function valoresIniciales(inicial: InicialReunion | undefined, responsables: string[]) {
  if (inicial?.fecha_reunion) {
    const d = new Date(inicial.fecha_reunion);
    return {
      fecha: new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(d),
      hora: new Intl.DateTimeFormat("en-GB", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d),
      modalidad: inicial.modalidad_reunion ?? "Meet",
      responsable: inicial.responsable_reunion ?? responsables[0] ?? "",
      enlace: inicial.enlace_reunion ?? "",
    };
  }
  const d = new Date(Date.now() + 86400000);
  while ([0, 6].includes(new Date(d.toLocaleString("en-US", { timeZone: "America/La_Paz" })).getDay())) d.setTime(d.getTime() + 86400000);
  const manana = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(d);
  return { fecha: manana, hora: "10:00", modalidad: "Meet", responsable: responsables[0] ?? "", enlace: "" };
}

export function DialogoReunion({
  contactoId,
  responsables,
  disparador,
  alTerminar,
  inicial,
  datos,
}: {
  contactoId: string;
  responsables: string[];
  disparador?: Disparador;
  alTerminar?: () => void;
  inicial?: InicialReunion;
  datos?: DatosCalendario;
}) {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState(() => valoresIniciales(inicial, responsables));
  const [pendiente, iniciar] = useTransition();
  const virtual = d.modalidad === "Meet" || d.modalidad === "Zoom";
  const reprograma = Boolean(inicial?.fecha_reunion);

  const agendar = () =>
    iniciar(async () => {
      const r = await agendarReunion(contactoId, d);
      if (!avisar(r)) return;
      setAbierto(false);
      mostrarPostReunion({
        contacto_id: contactoId,
        nombre: datos?.nombre ?? null,
        cargo: datos?.cargo,
        correo: datos?.correo,
        telefono_e164: datos?.telefono_e164,
        empresa: datos?.empresa,
        fecha_reunion: `${d.fecha}T${d.hora}:00-04:00`,
        modalidad_reunion: d.modalidad,
        responsable_reunion: d.responsable,
        enlace_reunion: r.datos?.enlace ?? (d.enlace || null),
        reprogramada: reprograma,
        calendario_url: r.datos?.calendario_url ?? null,
        evento_nuevo: Boolean(r.datos?.evento_nuevo),
      });
      alTerminar?.();
    });

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) setD(valoresIniciales(inicial, responsables));
      }}
    >
      <DialogTrigger asChild>
        {disparador ?? (
          <Button variant="outline">
            <CalendarCheck /> Reunión agendada
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reprograma ? "Reprogramar reunión" : "Agendar reunión"}</DialogTitle>
          <DialogDescription>Recordatorio el día hábil anterior y, el mismo día, {virtual ? "el enlace" : "una confirmación"} 1 hora antes.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Hora (Bolivia)</Label>
            <Input type="time" value={d.hora} onChange={(e) => setD({ ...d, hora: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Modalidad</Label>
            <Select value={d.modalidad} onValueChange={(v) => setD({ ...d, modalidad: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Meet", "Zoom", "presencial", "llamada"].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Responsable</Label>
            <Input list="responsables" value={d.responsable} onChange={(e) => setD({ ...d, responsable: e.target.value })} />
            <datalist id="responsables">
              {responsables.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          {virtual && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Enlace de {d.modalidad} (opcional, lo puedes agregar después)</Label>
              <Input value={d.enlace} onChange={(e) => setD({ ...d, enlace: e.target.value })} placeholder="https://meet.google.com/…" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button disabled={!d.fecha || !d.hora || pendiente} onClick={agendar}>
            {pendiente && <Loader2 className="animate-spin" />} {reprograma ? "Guardar cambios" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { avisar };
