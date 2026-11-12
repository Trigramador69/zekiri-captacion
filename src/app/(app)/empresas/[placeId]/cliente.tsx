"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MoreHorizontal, Plus, RotateCcw, Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DialogoGerente, DialogoReunion, DialogoRespuesta, avisar } from "@/components/dialogos-contacto";
import { PanelReunion } from "@/components/panel-reunion";
import { agregarContacto, cambiarEstado, descartarEmpresa, guardarEmpresa, restaurarEmpresa } from "@/app/acciones";
import { CIUDADES, ESTADOS, MOTIVOS_DESCARTE, OBJECIONES } from "@/lib/constantes";
import { calendarLink, telLegible } from "@/lib/mensajes";
import type { Contacto, Empresa } from "@/lib/tipos";

export function AccionesContacto({ contacto, responsables, empresa }: { contacto: Contacto; responsables: string[]; empresa?: string }) {
  const [pendiente, iniciar] = useTransition();
  const estado = (e: string, ok?: string) => iniciar(async () => void avisar(await cambiarEstado(contacto.contacto_id, e), ok));
  return (
    <>
    {contacto.estado === "REUNION_AGENDADA" && contacto.fecha_reunion && (
      <div className="mt-3">
        <PanelReunion r={{ ...contacto, empresa }} responsables={responsables} />
      </div>
    )}
    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
      <DialogoRespuesta contactoId={contacto.contacto_id} disparador={<Button size="sm" variant="outline">Respondió</Button>} />
      {contacto.rol_contacto !== "gerente" && (
        <DialogoGerente contactoId={contacto.contacto_id} nombreRecepcion={contacto.nombre} disparador={<Button size="sm" variant="outline">Gerente conseguido</Button>} />
      )}
      {contacto.estado !== "REUNION_AGENDADA" && (
        <DialogoReunion
          contactoId={contacto.contacto_id}
          responsables={responsables}
          datos={{ nombre: contacto.nombre, cargo: contacto.cargo, correo: contacto.correo, telefono_e164: contacto.telefono_e164, empresa }}
          disparador={<Button size="sm" variant="outline">Reunión</Button>}
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" disabled={pendiente}>
            {pendiente ? <Loader2 className="animate-spin" /> : <MoreHorizontal />} Estado
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          {["LISTO", "REUNION_1_HECHA", "PROPUESTA_ENVIADA", "REUNION_2", "GANADO", "PERDIDO"].map((e) => (
            <DropdownMenuItem key={e} onSelect={() => estado(e)}>
              {ESTADOS[e].etiqueta}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => estado("DESCARTADO")}>
            <X /> Descartar
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => estado("NO_CONTACTAR", "No se le volverá a escribir")}>
            <Ban /> No contactar nunca más
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    </>
  );
}

export function AgregarContacto({ placeId }: { placeId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ nombre: "", cargo: "", rol_contacto: "gerente", origen_contacto: "linkedin", canal: "WhatsApp", telefono: "", correo: "", linkedin_url: "" });
  const [pendiente, iniciar] = useTransition();
  const campo = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }) });
  const sel = (k: keyof typeof d, opciones: [string, string][]) => (
    <Select value={d[k]} onValueChange={(v) => setD({ ...d, [k]: v })}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map(([v, t]) => (
          <SelectItem key={v} value={v}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Contacto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar contacto</DialogTitle>
          <DialogDescription>Por ejemplo, un gerente que encontraste en LinkedIn o una presentación de tu jefe.</DialogDescription>
        </DialogHeader>
        <div className="grid [&>*]:min-w-0 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input autoFocus {...campo("nombre")} />
          </div>
          <div className="space-y-2">
            <Label>Cargo</Label>
            <Input {...campo("cargo")} />
          </div>
          <div className="space-y-2">
            <Label>Rol</Label>
            {sel("rol_contacto", [["gerente", "Gerente"], ["recepcion", "Recepción"], ["otro", "Otro"]])}
          </div>
          <div className="space-y-2">
            <Label>Origen</Label>
            {sel("origen_contacto", [["linkedin", "LinkedIn"], ["presentacion_jefe", "Presentación del jefe"], ["sitio_web", "Sitio web"], ["otro", "Otro"]])}
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            {sel("canal", [["WhatsApp", "WhatsApp"], ["LinkedIn", "LinkedIn"], ["correo", "Correo"], ["llamada", "Llamada"]])}
          </div>
          <div className="space-y-2">
            <Label>Celular</Label>
            <Input inputMode="tel" {...campo("telefono")} />
          </div>
          <div className="space-y-2">
            <Label>Correo</Label>
            <Input type="email" {...campo("correo")} />
          </div>
          <div className="space-y-2">
            <Label>LinkedIn</Label>
            <Input {...campo("linkedin_url")} placeholder="https://www.linkedin.com/in/…" />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!d.nombre.trim() || pendiente}
            onClick={() =>
              iniciar(async () => {
                if (avisar(await agregarContacto(placeId, d))) setAbierto(false);
              })
            }
          >
            {pendiente && <Loader2 className="animate-spin" />} Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccionesEmpresa({ placeId, estado }: { placeId: string; estado: string }) {
  const [pendiente, iniciar] = useTransition();
  if (estado === "DESCARTADA")
    return (
      <Button size="sm" variant="outline" disabled={pendiente} onClick={() => iniciar(async () => void avisar(await restaurarEmpresa(placeId), "Volvió a Revisar"))}>
        <RotateCcw /> Restaurar
      </Button>
    );
  if (estado !== "NUEVA" && estado !== "LISTA") return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" disabled={pendiente}>
          <X /> Descartar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        {MOTIVOS_DESCARTE.map((m) => (
          <DropdownMenuItem key={m} onSelect={() => iniciar(async () => void avisar(await descartarEmpresa(placeId, m), "Descartada"))}>
            {m}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DatosEmpresa({ empresa }: { empresa: Empresa }) {
  const [d, setD] = useState({ dato_personalizacion: empresa.dato_personalizacion ?? "", linkedin_empresa: empresa.linkedin_empresa ?? "", notas: empresa.notas ?? "" });
  const [pendiente, iniciar] = useTransition();
  const cambiado = d.dato_personalizacion !== (empresa.dato_personalizacion ?? "") || d.linkedin_empresa !== (empresa.linkedin_empresa ?? "") || d.notas !== (empresa.notas ?? "");
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <h3 className="font-semibold">Datos para personalizar</h3>
      <div className="space-y-2">
        <Label>Dato concreto</Label>
        <Input value={d.dato_personalizacion} onChange={(e) => setD({ ...d, dato_personalizacion: e.target.value })} placeholder="Ej.: venden por WhatsApp a 300 clientes" />
      </div>
      <div className="space-y-2">
        <Label>LinkedIn de la empresa</Label>
        <Input value={d.linkedin_empresa} onChange={(e) => setD({ ...d, linkedin_empresa: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>Notas</Label>
        <Textarea rows={4} value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} />
      </div>
      <Button className="w-full" disabled={!cambiado || pendiente} onClick={() => iniciar(async () => void avisar(await guardarEmpresa(empresa.place_id, d)))}>
        {pendiente && <Loader2 className="animate-spin" />} Guardar
      </Button>
    </section>
  );
}

export function FichaTraspaso({ empresa, contacto, contactos }: { empresa: Empresa; contacto: Contacto; contactos: Contacto[] }) {
  const inicio = contacto.fecha_reunion ? new Date(contacto.fecha_reunion) : null;
  const cuando = inicio
    ? new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(inicio)
    : "sin fecha";
  const respuestas = contactos.filter((c) => c.ultima_respuesta).map((c) => `- ${c.nombre || c.rol_contacto}: “${c.ultima_respuesta}”`);
  const objeciones = contactos.filter((c) => c.objecion).map((c) => OBJECIONES[c.objecion!]?.etiqueta ?? c.objecion);
  const texto = [
    `Reunión con ${empresa.empresa} — ${cuando} (${contacto.modalidad_reunion ?? "modalidad por definir"})`,
    `Responsable: ${contacto.responsable_reunion ?? "-"}`,
    ``,
    `Con quién: ${contacto.nombre ?? "-"}${contacto.cargo ? `, ${contacto.cargo}` : ""}${contacto.telefono_e164 ? ` · ${telLegible(contacto.telefono_e164)}` : ""}${contacto.correo ? ` · ${contacto.correo}` : ""}`,
    `Cómo llegamos: ${contacto.origen_contacto === "derivado_recepcion" ? `nos derivó ${contacto.persona_derivo ?? "recepción"}` : contacto.origen_contacto ?? "-"}`,
    `Empresa: ${empresa.sector ?? ""}, ${CIUDADES[empresa.ciudad as keyof typeof CIUDADES] ?? ""}. ${empresa.sucursales > 1 ? `${empresa.sucursales} sucursales. ` : ""}${empresa.resenas} reseñas en Google.${empresa.web ? ` Web: ${empresa.web}` : ""}`,
    empresa.dato_personalizacion ? `Dato: ${empresa.dato_personalizacion}` : "",
    respuestas.length ? `\nLo que dijeron:\n${respuestas.join("\n")}` : "",
    objeciones.length ? `Objeciones: ${objeciones.join(", ")}` : "",
    ``,
    `Objetivo de la reunión 1: escuchar cómo trabajan hoy y dónde pierden tiempo. No vender.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
  return (
    <section className="space-y-3 rounded-2xl border border-success/40 bg-success/[0.06] p-5">
      <h3 className="font-semibold">Ficha de traspaso</h3>
      <pre className="whitespace-pre-wrap rounded-xl bg-background p-3 font-sans text-sm leading-relaxed">{texto}</pre>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(texto).then(() => toast.success("Ficha copiada"))}>
          <Copy /> Copiar
        </Button>
        {inicio && (
          <Button size="sm" variant="outline" asChild>
            <a
              href={calendarLink({ titulo: `Zékiri × ${empresa.empresa}`, inicio, detalle: texto, invitados: [contacto.correo], lugar: contacto.enlace_reunion ?? "" })}
              target="_blank"
              rel="noopener noreferrer"
            >
              Agregar a Google Calendar
            </a>
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Estado actual: {ESTADOS[contacto.estado]?.etiqueta}</p>
    </section>
  );
}
