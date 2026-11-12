"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, Play, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { avisar } from "@/components/dialogos-contacto";
import { agregarExclusion, correrConsulta, guardarConfig, guardarConsulta, guardarPlantilla } from "@/app/acciones";
import { CIUDADES, NOMBRES_PLANTILLA, SECTORES } from "@/lib/constantes";
import type { Plantilla } from "@/lib/tipos";
import { Integraciones } from "./integraciones";

type Fila = Record<string, unknown>;

const ETIQUETAS: Record<string, string> = {
  mi_nombre: "Tu nombre (firma los mensajes)",
  mi_cargo: "Tu cargo en Zékiri",
  mi_numero: "Tu número (+591…)",
  sitio_web: "Sitio web",
  umbral_revision_base: "Puntaje base mínimo para revisar",
  umbral_A: "Puntaje final mínimo para A",
  umbral_B: "Puntaje final mínimo para B",
  limite_nuevos_dia_sem1: "Chats nuevos por día (semana 1)",
  limite_nuevos_dia_sem2: "Chats nuevos por día (semana 2+)",
  limite_li_invitaciones_dia: "Invitaciones de LinkedIn por día",
  max_mensajes_sin_respuesta: "Máximo de mensajes sin respuesta",
  responsable_reunion_default: "Responsable de reunión por defecto",
  fecha_inicio: "Fecha de inicio de la captación",
};

export function ConfigTabs(props: {
  tab: string;
  config: Fila[];
  plantillas: Plantilla[];
  consultas: Fila[];
  exclusion: Fila[];
  perfiles: Fila[];
  feriados: Fila[];
  placesConfigurado: boolean;
  integraciones: { configurado: boolean; correo: string | null; conexion: { email: string; actualizado: string } | null; ultimaEjecucion: { enviado: string; detalle: string | null } | null; estadoUrl?: string };
}) {
  const router = useRouter();
  return (
    <Tabs defaultValue={props.tab} onValueChange={(v) => router.replace(`/config?tab=${v}`, { scroll: false })}>
      <TabsList className="mb-6 w-full justify-start overflow-x-auto sm:w-auto">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="plantillas">Plantillas</TabsTrigger>
        <TabsTrigger value="busquedas">Búsquedas</TabsTrigger>
        <TabsTrigger value="exclusion">Exclusión</TabsTrigger>
        <TabsTrigger value="integraciones">Integraciones</TabsTrigger>
        <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <General config={props.config} />
      </TabsContent>
      <TabsContent value="plantillas">
        <Plantillas plantillas={props.plantillas} config={props.config} />
      </TabsContent>
      <TabsContent value="busquedas">
        <Busquedas consultas={props.consultas} placesConfigurado={props.placesConfigurado} />
      </TabsContent>
      <TabsContent value="exclusion">
        <Exclusion filas={props.exclusion} />
      </TabsContent>
      <TabsContent value="integraciones">
        <Integraciones {...props.integraciones} config={Object.fromEntries(props.config.map((c) => [String(c.clave), String(c.valor ?? "")]))} />
      </TabsContent>
      <TabsContent value="usuarios">
        <Usuarios perfiles={props.perfiles} feriados={props.feriados} />
      </TabsContent>
    </Tabs>
  );
}

function General({ config }: { config: Fila[] }) {
  const inicial = Object.fromEntries(config.map((c) => [String(c.clave), String(c.valor ?? "")]));
  if (!("fecha_inicio" in inicial)) inicial.fecha_inicio = "2026-11-09";
  const [v, setV] = useState<Record<string, string>>(inicial);
  const [pendiente, iniciar] = useTransition();
  const notas = Object.fromEntries(config.map((c) => [String(c.clave), String(c.nota ?? "")]));
  const grupos = [
    { titulo: "Tus datos", claves: ["mi_nombre", "mi_cargo", "mi_numero", "sitio_web", "responsable_reunion_default"] },
    { titulo: "Puntaje", claves: ["umbral_revision_base", "umbral_A", "umbral_B"] },
    { titulo: "Límites", claves: ["fecha_inicio", "limite_nuevos_dia_sem1", "limite_nuevos_dia_sem2", "limite_li_invitaciones_dia", "max_mensajes_sin_respuesta"] },
  ];
  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <section key={g.titulo} className="rounded-2xl border bg-card p-5 sm:p-6">
          <h3 className="mb-4 font-semibold">{g.titulo}</h3>
          <div className="grid [&>*]:min-w-0 gap-4 sm:grid-cols-2">
            {g.claves.map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={k}>{ETIQUETAS[k] ?? k}</Label>
                <Input
                  id={k}
                  type={k === "fecha_inicio" ? "date" : "text"}
                  value={v[k] === "COMPLETAR" ? "" : (v[k] ?? "")}
                  placeholder={v[k] === "COMPLETAR" ? "Completar" : ""}
                  onChange={(e) => setV({ ...v, [k]: e.target.value })}
                  aria-invalid={v[k] === "COMPLETAR" || undefined}
                />
                {notas[k] && <p className="text-xs text-muted-foreground">{notas[k]}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
      <Button size="lg" disabled={pendiente} onClick={() => iniciar(async () => void avisar(await guardarConfig(v)))}>
        {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar cambios
      </Button>
    </div>
  );
}



const VARIABLES = ["empresa", "nombre", "persona_derivo", "ciudad", "sector", "mi_nombre", "mi_cargo", "mi_numero", "sitio_web", "dia", "hora", "modalidad", "enlace"];

function Plantillas({ plantillas, config }: { plantillas: Plantilla[]; config: Fila[] }) {
  const [sel, setSel] = useState(plantillas[0]?.id ?? "");
  const actual = plantillas.find((p) => p.id === sel);
  const [texto, setTexto] = useState(actual?.texto ?? "");
  const [pendiente, iniciar] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const cfg = Object.fromEntries(config.map((c) => [String(c.clave), String(c.valor ?? "")]));
  const ejemplo: Record<string, string> = {
    empresa: "Laboratorio Andino",
    nombre: "Juan",
    persona_derivo: "Ana",
    ciudad: "Santa Cruz",
    sector: "salud",
    dia: "jueves 12 de noviembre",
    hora: "10:00",
    modalidad: "por Google Meet",
    enlace: "https://meet.google.com/abc-defg-hij",
    mi_nombre: cfg.mi_nombre,
    mi_cargo: cfg.mi_cargo,
    mi_numero: cfg.mi_numero,
    sitio_web: cfg.sitio_web,
  };
  const partes = texto.split(/(\{[a-z_]+\})/g);
  const desconocidas = [...texto.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((v) => !VARIABLES.includes(v));
  const insertar = (v: string) => {
    const el = area.current;
    const ins = `{${v}}`;
    if (!el) return setTexto((t) => t + ins);
    const a = el.selectionStart ?? texto.length;
    const b = el.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, a) + ins + texto.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + ins.length, a + ins.length);
    });
  };
  const grupos: Record<string, Plantilla[]> = {};
  for (const p of plantillas) {
    const g = p.id.split("_")[0];
    (grupos[g] ??= []).push(p);
  }
  const NOMBRES: Record<string, string> = { REC: "Recepción", GER: "Gerente", REU: "Reunión", OBJ: "Objeciones", LI: "LinkedIn" };
  const cambiar = (p: Plantilla) => {
    if (actual && texto !== actual.texto && !window.confirm("Tienes cambios sin guardar en esta plantilla. ¿Descartarlos?")) return;
    setSel(p.id);
    setTexto(p.texto);
  };
  return (
    <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-[280px_1fr]">
      <nav className="max-h-[620px] overflow-y-auto rounded-2xl border bg-card p-2">
        {Object.entries(grupos).map(([g, ps]) => (
          <div key={g} className="mb-2">
            <p className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{NOMBRES[g] ?? g}</p>
            {ps.map((p) => (
              <button
                key={p.id}
                onClick={() => cambiar(p)}
                className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm ${p.id === sel ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
              >
                {NOMBRES_PLANTILLA[p.id] ?? p.id}
              </button>
            ))}
          </div>
        ))}
      </nav>
      {actual && (
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <div>
            <h3 className="font-semibold">{NOMBRES_PLANTILLA[actual.id] ?? actual.id}</h3>
            <p className="text-xs text-muted-foreground">
              {[actual.id, actual.rol, actual.canal, actual.variante && `variante ${actual.variante}`, actual.notas].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Textarea ref={area} rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} className="text-[15px] leading-relaxed" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Insertar:</span>
            {VARIABLES.map((v) => (
              <button key={v} onClick={() => insertar(v)} className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
                {`{${v}}`}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Así se ve (con datos de ejemplo)</p>
            <div className="whitespace-pre-wrap rounded-xl bg-[#e7ffdb] px-4 py-3 text-[15px] leading-relaxed text-[#111b21] shadow-xs dark:bg-[#005c4b] dark:text-[#e9edef]">
              {partes.map((t, i) => {
                const m = t.match(/^\{([a-z_]+)\}$/);
                if (!m) return <span key={i}>{t}</span>;
                const v = ejemplo[m[1]];
                return v && v !== "COMPLETAR" ? (
                  <span key={i} className="rounded bg-black/5 px-0.5 dark:bg-white/10">{v}</span>
                ) : (
                  <span key={i} className="rounded bg-destructive/15 px-0.5 text-destructive">{t}</span>
                );
              })}
            </div>
            {desconocidas.length > 0 && <p className="text-xs text-destructive">Variables que no existen: {desconocidas.map((v) => `{${v}}`).join(", ")}</p>}
            <p className="text-xs text-muted-foreground">El saludo inicial («Buenos días») se ajusta solo a la hora del envío. En rojo: datos que faltan completar en General.</p>
          </div>
          <div className="flex gap-2">
            <Button disabled={texto === actual.texto || pendiente} onClick={() => iniciar(async () => void avisar(await guardarPlantilla(actual.id, texto)))}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Save />} Guardar plantilla
            </Button>
            {texto !== actual.texto && (
              <Button variant="ghost" onClick={() => setTexto(actual.texto)}>
                Deshacer cambios
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Busquedas({ consultas, placesConfigurado }: { consultas: Fila[]; placesConfigurado: boolean }) {
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ ciudad: "SCZ", sector: SECTORES[0], termino: "", zona: "" });
  const [pendiente, iniciar] = useTransition();
  const correr = (id: string) => {
    setCorriendo(id);
    iniciar(async () => {
      avisar(await correrConsulta(id));
      setCorriendo(null);
    });
  };
  const fmt = (v: unknown) => (v ? new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", timeZone: "America/La_Paz" }).format(new Date(String(v))) : "nunca");
  return (
    <div className="space-y-4">
      {!placesConfigurado && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">Falta la variable PLACES_API_KEY en el servidor: las búsquedas no van a funcionar.</p>
      )}
      <p className="text-sm text-muted-foreground">
        Cada búsqueda usa hasta 3 solicitudes (60 resultados). Tienes 1.000 gratis al mes. Si una búsqueda llega a 60, crea otra con zona (por ejemplo «Equipetrol»).
      </p>
      <section className="rounded-2xl border bg-card p-4">
        <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-[140px_1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Ciudad</Label>
            <Select value={nueva.ciudad} onValueChange={(v) => setNueva({ ...nueva, ciudad: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CIUDADES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sector</Label>
            <Select value={nueva.sector} onValueChange={(v) => setNueva({ ...nueva, sector: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTORES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Qué buscar</Label>
            <Input value={nueva.termino} onChange={(e) => setNueva({ ...nueva, termino: e.target.value })} placeholder="ferretería mayorista" />
          </div>
          <div className="space-y-1.5">
            <Label>Zona (opcional)</Label>
            <Input value={nueva.zona} onChange={(e) => setNueva({ ...nueva, zona: e.target.value })} placeholder="Equipetrol" />
          </div>
          <Button
            disabled={!nueva.termino.trim() || pendiente}
            onClick={() =>
              iniciar(async () => {
                if (avisar(await guardarConsulta(nueva), "Búsqueda agregada")) setNueva({ ...nueva, termino: "", zona: "" });
              })
            }
          >
            <Plus /> Agregar
          </Button>
        </div>
      </section>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Búsqueda</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Sector</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Última vez</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {consultas.map((c) => (
              <tr key={String(c.id)}>
                <td className="px-4 py-3">
                  <span className="font-medium">{String(c.termino)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {c.zona ? `${String(c.zona)}, ` : ""}
                    {CIUDADES[String(c.ciudad) as keyof typeof CIUDADES]}
                  </span>
                  <span className="block text-xs text-muted-foreground">{String(c.id)}</span>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{String(c.sector ?? "")}</td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {fmt(c.ultima_ejecucion)}
                  {c.resultados != null ? ` · ${String(c.resultados)}` : ""}
                  {Number(c.resultados) >= 60 && <span className="ml-1 text-warning-foreground dark:text-warning">(tope)</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant={c.ultima_ejecucion ? "outline" : "default"} disabled={pendiente || !placesConfigurado} onClick={() => correr(String(c.id))}>
                    {corriendo === c.id ? <Loader2 className="animate-spin" /> : <Play />} Buscar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Exclusion({ filas }: { filas: Fila[] }) {
  const [d, setD] = useState({ telefono: "", correo: "", motivo: "Pidió no recibir mensajes" });
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Nadie de esta lista vuelve a aparecer en la cola, por ningún canal. Se agrega solo cuando alguien pide no recibir mensajes.</p>
      <section className="grid [&>*]:min-w-0 gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Correo</Label>
          <Input value={d.correo} onChange={(e) => setD({ ...d, correo: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Motivo</Label>
          <Input value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} />
        </div>
        <Button disabled={(!d.telefono && !d.correo) || pendiente} onClick={() => iniciar(async () => void avisar(await agregarExclusion(d), "Agregado a exclusión"))}>
          <Plus /> Agregar
        </Button>
      </section>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {filas.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">La lista está vacía.</p>
        ) : (
          <ul className="divide-y text-sm">
            {filas.map((f) => (
              <li key={String(f.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-medium">{String(f.telefono_e164 ?? f.correo ?? f.place_id ?? "")}</span>
                <span className="text-muted-foreground">{String(f.motivo ?? "")}</span>
                <span className="ml-auto text-xs text-muted-foreground">{String(f.fecha)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Usuarios({ perfiles, feriados }: { perfiles: Fila[]; feriados: Fila[] }) {
  return (
    <div className="grid [&>*]:min-w-0 gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="mb-1 font-semibold">Usuarios</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Para dar acceso: Supabase → Authentication → Users → <strong>Invite user</strong> con su correo. Entra con el código que le llega.
        </p>
        <ul className="divide-y text-sm">
          {perfiles.map((p) => (
            <li key={String(p.id)} className="flex items-center justify-between py-2.5">
              <span className="font-medium">{String(p.nombre)}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{String(p.rol)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="mb-1 font-semibold">Feriados</h3>
        <p className="mb-4 text-sm text-muted-foreground">Los departamentales solo cuentan para esa ciudad. Verifica las fechas con el decreto oficial.</p>
        <ul className="max-h-80 divide-y overflow-y-auto text-sm">
          {feriados.map((f) => (
            <li key={`${String(f.fecha)}-${String(f.ambito)}`} className="flex items-center gap-3 py-2">
              <span className="w-24 tabular-nums text-muted-foreground">{String(f.fecha)}</span>
              <span className="flex-1">{String(f.nombre)}</span>
              <span className="text-xs text-muted-foreground">{String(f.ambito)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
