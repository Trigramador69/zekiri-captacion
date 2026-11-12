"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  BriefcaseBusiness,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EstadoBadge, Prioridad } from "@/components/comunes";
import { PanelReunion } from "@/components/panel-reunion";
import { Input } from "@/components/ui/input";
import { DialogoGerente, DialogoReunion, DialogoRespuesta, avisar } from "@/components/dialogos-contacto";
import { cambiarEstado, cambiarVariante, guardarMensaje, registrarEnvio, registrarMaterial, usarPlantilla } from "@/app/acciones";
import { CIUDADES, NOMBRES_PLANTILLA } from "@/lib/constantes";
import { ajustarSaludo, mapsLink, telLegible, waLink } from "@/lib/mensajes";
import type { ItemCola } from "@/lib/datos";
import type { Material } from "@/lib/tipos";
import { cn } from "@/lib/utils";

const NOMBRE_PLANTILLA = NOMBRES_PLANTILLA;

const fechaCorta = (f: string | null) =>
  f ? new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${f}T00:00:00Z`)) : "";

export type Grupo = { k: string; etiqueta: string; estados?: string[] };

const GRUPOS_COLA: Grupo[] = [
  { k: "todo", etiqueta: "Todo" },
  { k: "pendiente", etiqueta: "Seguimientos" },
  { k: "nuevo", etiqueta: "Nuevos" },
];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function ColaTrabajo({
  items,
  materiales,
  plantillasRapidas,
  responsables,
  bloquearNuevos,
  modo = "cola",
  grupos,
  seleccionInicial,
}: {
  items: ItemCola[];
  materiales: Material[];
  plantillasRapidas: string[];
  responsables: string[];
  bloquearNuevos: boolean;
  modo?: "cola" | "conversaciones";
  grupos?: Grupo[];
  seleccionInicial?: string;
}) {
  const esCola = modo === "cola";
  const gruposUsados = grupos ?? GRUPOS_COLA;
  const grupoDe = (estado: string) => gruposUsados.find((g) => g.estados?.includes(estado))?.k;
  const [filtro, setFiltro] = useState<string>(() => {
    if (esCola) return gruposUsados[0].k;
    const it = seleccionInicial ? items.find((i) => i.contacto_id === seleccionInicial) : undefined;
    if (it) return grupoDe(it.estado) ?? gruposUsados[0].k;
    // primera pestaña con contactos
    return gruposUsados.find((g) => g.estados && items.some((i) => g.estados!.includes(i.estado)))?.k ?? gruposUsados[0].k;
  });
  const [ciudad, setCiudad] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");
  // En la cola, los registrados se ocultan al instante (sin esperar al servidor); si falla, vuelven.
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const enGrupo = useCallback(
    (i: ItemCola, k: string) => {
      const g = gruposUsados.find((x) => x.k === k);
      if (!g || k === "todo") return true;
      if (g.estados) return g.estados.includes(i.estado);
      return i.tipo === k;
    },
    [gruposUsados]
  );
  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    const qDig = busqueda.replace(/\D/g, "");
    return items.filter((i) => {
      if (ocultos.has(i.contacto_id)) return false;
      if (ciudad !== "todas" && i.empresas?.ciudad !== ciudad) return false;
      if (q) {
        const texto = sinTildes(`${i.empresas?.empresa ?? ""} ${i.nombre ?? ""} ${i.persona_derivo ?? ""}`);
        const tel = (i.telefono_e164 ?? "").replace(/\D/g, "");
        return texto.includes(q) || (qDig.length >= 4 && tel.includes(qDig));
      }
      return enGrupo(i, filtro);
    });
  }, [items, filtro, ciudad, ocultos, busqueda, enGrupo]);
  const [seleccion, setSeleccion] = useState<string | null>(seleccionInicial ?? visibles[0]?.contacto_id ?? null);
  const [verDetalleMovil, setVerDetalleMovil] = useState(Boolean(seleccionInicial));

  const actual = visibles.find((i) => i.contacto_id === seleccion) ?? visibles[0] ?? null;

  // Si el elegido salió de la lista: en Conversaciones la pestaña lo sigue; en la cola se pasa al siguiente.
  useEffect(() => {
    if (!seleccion || visibles.some((i) => i.contacto_id === seleccion)) return;
    const it = items.find((i) => i.contacto_id === seleccion);
    if (!esCola && it && !busqueda) {
      const g = grupoDe(it.estado);
      if (g && g !== filtro) {
        setFiltro(g);
        return;
      }
    }
    setSeleccion(visibles[0]?.contacto_id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles, seleccion]);

  const mover = useCallback(
    (d: number) => {
      if (!visibles.length) return;
      const i = Math.max(0, visibles.findIndex((x) => x.contacto_id === actual?.contacto_id));
      const n = visibles[Math.min(visibles.length - 1, Math.max(0, i + d))];
      setSeleccion(n.contacto_id);
    },
    [visibles, actual]
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], [role=dialog], [role=menu]")) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        mover(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        mover(-1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mover]);

  const siguienteDe = (id: string) => {
    const i = visibles.findIndex((x) => x.contacto_id === id);
    return visibles[i + 1]?.contacto_id ?? visibles[i - 1]?.contacto_id ?? null;
  };

  const ciudades = [...new Set(items.map((i) => i.empresas?.ciudad).filter(Boolean))] as string[];

  return (
    <div className="grid [&>*]:min-w-0 gap-4 lg:grid-cols-[minmax(300px,380px)_1fr] lg:gap-6">
      {/* Lista */}
      <section className={cn("space-y-3", verDetalleMovil && "hidden lg:block")}>
        {!esCola && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por empresa, nombre o celular…"
              className="h-10 bg-card pl-9"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {gruposUsados.map((g) => (
            <button
              key={g.k}
              onClick={() => {
                setFiltro(g.k);
                setBusqueda("");
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filtro === g.k && !busqueda ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
              )}
            >
              {g.etiqueta} · {items.filter((i) => !ocultos.has(i.contacto_id) && enGrupo(i, g.k)).length}
            </button>
          ))}
          {ciudades.length > 1 && (
            <select
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              className="rounded-full border bg-card px-3 py-1 text-xs font-medium"
              aria-label="Ciudad"
            >
              <option value="todas">Todas las ciudades</option>
              {ciudades.map((c) => (
                <option key={c} value={c}>
                  {CIUDADES[c as keyof typeof CIUDADES] ?? c}
                </option>
              ))}
            </select>
          )}
        </div>
        <ul className="overflow-hidden rounded-2xl border bg-card lg:max-h-[calc(100dvh-220px)] lg:overflow-y-auto">
          {visibles.map((it) => {
            const sel = it.contacto_id === actual?.contacto_id;
            return (
              <li key={it.contacto_id} className="border-b last:border-b-0">
                <button
                  onClick={() => {
                    setSeleccion(it.contacto_id);
                    setVerDetalleMovil(true);
                  }}
                  className={cn(
                    "relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                    sel ? "bg-primary/[0.07]" : "hover:bg-muted/60"
                  )}
                >
                  {sel && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />}
                  <Prioridad valor={it.prioridad} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.empresas?.empresa ?? it.nombre ?? it.contacto_id}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <EstadoBadge estado={it.estado} />
                      {it.rol_contacto === "gerente" && <span className="font-medium text-foreground">Gerente{it.nombre ? `: ${it.nombre}` : ""}</span>}
                      {it.vencido && <span className="font-medium text-destructive">vencido {fechaCorta(it.fecha_proxima)}</span>}
                      {!esCola && !it.vencido && it.fecha_proxima && <span>próximo {fechaCorta(it.fecha_proxima)}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{it.empresas?.ciudad}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="hidden text-center text-xs text-muted-foreground lg:block">
          <kbd className="rounded border bg-muted px-1">J</kbd> / <kbd className="rounded border bg-muted px-1">K</kbd> para moverte
          {!visibles.length && " · sin resultados"}
        </p>
      </section>

      {/* Detalle */}
      <section className={cn(!verDetalleMovil && "hidden lg:block")}>
        {actual ? (
          <Detalle
            key={actual.contacto_id + (actual.mensaje_siguiente ?? "")}
            item={actual}
            materiales={materiales}
            plantillasRapidas={plantillasRapidas}
            responsables={responsables}
            bloquearNuevos={bloquearNuevos}
            esCola={esCola}
            alVolver={() => setVerDetalleMovil(false)}
            alTerminar={() => (esCola ? setSeleccion(siguienteDe(actual.contacto_id)) : undefined)}
            ocultar={(id, si) =>
              esCola &&
              setOcultos((o) => {
                const n = new Set(o);
                if (si) n.add(id);
                else n.delete(id);
                return n;
              })
            }
          />
        ) : (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No hay elementos con este filtro.</div>
        )}
      </section>
    </div>
  );
}

function Detalle({
  item,
  materiales,
  plantillasRapidas,
  responsables,
  bloquearNuevos,
  esCola,
  alVolver,
  alTerminar,
  ocultar,
}: {
  item: ItemCola;
  materiales: Material[];
  plantillasRapidas: string[];
  responsables: string[];
  bloquearNuevos: boolean;
  esCola: boolean;
  alVolver: () => void;
  alTerminar: () => void;
  ocultar: (id: string, si: boolean) => unknown;
}) {
  const e = item.empresas;
  const [texto, setTexto] = useState(() => ajustarSaludo(item.mensaje_siguiente ?? ""));
  const [abierto, setAbierto] = useState(false);
  const [adjuntos, setAdjuntos] = useState<Material[]>([]);
  const [pendiente, iniciar] = useTransition();
  const faltantes = [...texto.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
  const canal = item.canal;
  const tel = item.telefono_e164;
  const esNuevo = item.estado === "LISTO";

  const guardarSiCambio = () => {
    if (texto !== ajustarSaludo(item.mensaje_siguiente ?? "")) iniciar(async () => void (await guardarMensaje(item.contacto_id, texto)));
  };

  const abrir = () => {
    let url = "";
    if (canal === "WhatsApp") url = waLink(tel, texto);
    else if (canal === "correo") {
      const [primera, ...resto] = texto.split("\n");
      const asunto = primera.replace(/^Asunto:\s*/i, "");
      const cuerpo = /^Asunto:/i.test(primera) ? resto.join("\n").trim() : texto;
      url = `mailto:${item.correo ?? ""}?subject=${encodeURIComponent(/^Asunto:/i.test(primera) ? asunto : "")}&body=${encodeURIComponent(cuerpo)}`;
    } else if (canal === "LinkedIn") {
      navigator.clipboard?.writeText(texto).then(() => toast.success("Mensaje copiado: pégalo en LinkedIn"));
      url = item.linkedin_url || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${item.nombre ?? ""} ${e?.empresa ?? ""}`)}`;
    } else if (canal === "llamada") url = `tel:${tel ?? e?.tel_publico ?? ""}`;
    if (url) window.open(url, "_blank", "noopener");
    setAbierto(true);
  };

  const confirmar = async () => {
    const id = item.contacto_id;
    const adj = adjuntos;
    alTerminar();
    ocultar(id, true);
    const r = await registrarEnvio(id, texto);
    if (avisar(r)) {
      for (const m of adj) await registrarMaterial(id, m.id, m.titulo);
    } else ocultar(id, false);
  };

  const insertarMaterial = (m: Material) => {
    setTexto((t) => `${t.trim()}\n\n${m.titulo}: ${m.url}`);
    setAdjuntos((a) => (a.some((x) => x.id === m.id) ? a : [...a, m]));
  };

  const etiquetaAbrir =
    canal === "WhatsApp" ? "Abrir WhatsApp" : canal === "correo" ? "Abrir correo" : canal === "LinkedIn" ? "Copiar y abrir LinkedIn" : "Llamar";
  const IconoAbrir = canal === "correo" ? Mail : canal === "LinkedIn" ? BriefcaseBusiness : canal === "llamada" ? Phone : WhatsAppIcono;
  const sinMensaje = canal !== "llamada" && !texto.trim();
  const hoyBo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
  const adelantado = !esNuevo && !!item.fecha_proxima && item.fecha_proxima > hoyBo && !!item.plantilla_siguiente && !item.plantilla_siguiente.startsWith("REU_");
  const faltaConfig = faltantes.some((f) => ["mi_cargo", "mi_numero", "sitio_web", "mi_nombre"].includes(f));
  const faltaEnlace = faltantes.includes("enlace");
  const bloqueado = esNuevo && bloquearNuevos;

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Cabecera */}
      <header className="border-b bg-gradient-to-b from-muted/50 to-transparent p-5 sm:p-6">
        <button onClick={alVolver} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground lg:hidden">
          <ArrowLeft className="size-4" /> {esCola ? "Cola" : "Conversaciones"}
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Prioridad valor={item.prioridad} />
              <EstadoBadge estado={item.estado} />
              {item.variante_mensaje && esNuevo && <span className="text-xs text-muted-foreground">Variante {item.variante_mensaje}</span>}
            </div>
            <h2 className="text-xl font-semibold leading-tight tracking-tight">
              {e ? (
                <Link href={`/empresas/${encodeURIComponent(e.place_id)}`} className="hover:underline">
                  {e.empresa}
                </Link>
              ) : (
                item.nombre
              )}
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {e?.sector && <span>{e.sector}</span>}
              {e?.ciudad && <span>{CIUDADES[e.ciudad as keyof typeof CIUDADES]}</span>}
              {tel && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3.5" /> {telLegible(tel)}
                </span>
              )}
              {item.rol_contacto === "gerente" && item.nombre && (
                <span className="font-medium text-foreground">
                  {item.nombre}
                  {item.cargo ? ` · ${item.cargo}` : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {e && (
              <Button variant="ghost" size="icon" asChild title="Ver en Google Maps">
                <a href={mapsLink(e.place_id, e.empresa)} target="_blank" rel="noopener noreferrer">
                  <MapPin />
                </a>
              </Button>
            )}
            {e?.web && (
              <Button variant="ghost" size="icon" asChild title="Sitio web">
                <a href={e.web} target="_blank" rel="noopener noreferrer">
                  <Globe />
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        {/* Próxima acción */}
        <div className="flex items-start gap-3 rounded-xl bg-primary/[0.06] p-3.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">{item.proxima_accion || "Siguiente paso"}</p>
            {e?.dato_personalizacion && <p className="mt-0.5 text-muted-foreground">Dato: {e.dato_personalizacion}</p>}
            {item.fecha_ultimo_envio && (
              <p className="mt-0.5 text-muted-foreground">
                Último envío {fechaCorta(item.fecha_ultimo_envio)} · {item.n_envios_sin_resp} sin respuesta
              </p>
            )}
          </div>
        </div>

        {item.estado === "REUNION_AGENDADA" && item.fecha_reunion && (
          <PanelReunion
            r={{ ...item, empresa: e?.empresa }}
            responsables={responsables}
          />
        )}

        {item.ultima_respuesta && (
          <blockquote className="rounded-xl border-l-4 border-warning bg-warning/10 px-4 py-3 text-sm">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Última respuesta</p>
            {item.ultima_respuesta}
          </blockquote>
        )}

        {/* Mensaje */}
        {canal !== "llamada" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="mensaje" className="text-sm font-medium">
                Mensaje
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {esNuevo && item.rol_contacto === "recepcion" && (
                  <div className="mr-1 inline-flex rounded-lg border p-0.5 text-xs">
                    {(["A", "B"] as const).map((v) => (
                      <button
                        key={v}
                        disabled={pendiente}
                        onClick={() => v !== item.variante_mensaje && iniciar(async () => void avisar(await cambiarVariante(item.contacto_id, v), `Variante ${v}`))}
                        className={cn("rounded-md px-2.5 py-1 font-medium", item.variante_mensaje === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                        title={v === "A" ? "Saludo corto en 2 pasos" : "Presentación directa en 1 paso"}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      Plantillas <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>Reemplazar el mensaje por…</DropdownMenuLabel>
                    {plantillasRapidas.map((p) => (
                      <DropdownMenuItem key={p} onSelect={() => iniciar(async () => void avisar(await usarPlantilla(item.contacto_id, p), "Plantilla aplicada"))}>
                        {NOMBRE_PLANTILLA[p] ?? p}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {materiales.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <FileText /> Material <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel>Agregar enlace al mensaje</DropdownMenuLabel>
                      {materiales.map((m) => (
                        <DropdownMenuItem key={m.id} onSelect={() => insertarMaterial(m)}>
                          <FileText /> <span className="truncate">{m.titulo}</span>
                          {m.sector && <span className="ml-auto text-xs text-muted-foreground">{m.sector}</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            <Textarea
              id="mensaje"
              value={texto}
              onChange={(ev) => setTexto(ev.target.value)}
              onBlur={guardarSiCambio}
              rows={Math.min(12, Math.max(4, Math.ceil(texto.length / 70) + 1))}
              className="resize-y text-[15px] leading-relaxed"
              placeholder="Escribe el mensaje…"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {faltaEnlace ? (
                  <span className="text-destructive">Falta el enlace de la reunión: pégalo en el recuadro verde de arriba.</span>
                ) : faltaConfig ? (
                  <span className="text-destructive">
                    Faltan tus datos ({faltantes.join(", ")}): complétalos en{" "}
                    <Link href="/config" className="font-medium underline">
                      Configuración
                    </Link>
                    .
                  </span>
                ) : faltantes.length ? (
                  <span className="text-destructive">Faltan datos: {faltantes.join(", ")}. Edita el mensaje o completa la ficha.</span>
                ) : (
                  "Puedes editarlo antes de enviar."
                )}
              </span>
              <span className="tabular-nums">{texto.length} caracteres</span>
            </div>
          </div>
        )}

        {adelantado && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Este seguimiento está programado para el {fechaCorta(item.fecha_proxima)}. Si lo envías antes, cuenta igual como seguimiento.
          </p>
        )}

        {/* Acción principal */}
        {sinMensaje && canal !== "llamada" ? null : !abierto ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              onClick={abrir}
              disabled={sinMensaje || faltantes.length > 0 || bloqueado || (canal === "WhatsApp" && !tel)}
              className={cn("h-12 flex-1 text-base", canal === "WhatsApp" && "bg-whatsapp text-white hover:bg-whatsapp/90")}
            >
              <IconoAbrir className="size-5" /> {etiquetaAbrir}
            </Button>
            {canal !== "llamada" && (
              <Button
                size="lg"
                variant="outline"
                className="h-12"
                onClick={() => navigator.clipboard?.writeText(texto).then(() => toast.success("Mensaje copiado"))}
              >
                <Copy /> Copiar
              </Button>
            )}
          </div>
        ) : null}
        {!abierto && !(sinMensaje && canal !== "llamada") && canal !== "llamada" && (
          <button
            onClick={() => setAbierto(true)}
            disabled={bloqueado}
            className="-mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            ¿Ya lo enviaste desde otro dispositivo? Regístralo sin abrir {canal === "WhatsApp" ? "WhatsApp" : canal}
          </button>
        )}
        {abierto && (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm font-medium">{canal === "llamada" ? "¿Cómo te fue con la llamada?" : "¿Lo enviaste?"}</p>
            {canal !== "llamada" ? (
              <div className="flex gap-2">
                <Button size="lg" onClick={confirmar} disabled={pendiente} className="h-11 flex-1 sm:flex-none">
                  {pendiente ? <Loader2 className="animate-spin" /> : <Check />} Sí, registrar
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setAbierto(false)} className="h-11">
                  <X /> No
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setAbierto(false)}>
                Cerrar
              </Button>
            )}
          </div>
        )}
        {bloqueado && <p className="text-xs text-muted-foreground">Hoy no se envían chats nuevos (feriado o fin de semana).</p>}

        {/* Resultados */}
        <div className="flex flex-wrap gap-2 border-t pt-5">
          <DialogoRespuesta contactoId={item.contacto_id} alTerminar={() => undefined} />
          {item.rol_contacto !== "gerente" && <DialogoGerente contactoId={item.contacto_id} nombreRecepcion={item.nombre} alTerminar={alTerminar} />}
          {item.estado !== "REUNION_AGENDADA" && (
            <DialogoReunion
              contactoId={item.contacto_id}
              responsables={responsables}
              alTerminar={alTerminar}
              datos={{ nombre: item.nombre, cargo: item.cargo, correo: item.correo, telefono_e164: item.telefono_e164, empresa: e?.empresa }}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="Más acciones">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {item.estado === "REUNION_AGENDADA" && (
                <DropdownMenuItem onSelect={() => iniciar(async () => void avisar(await cambiarEstado(item.contacto_id, "REUNION_1_HECHA")))}>
                  <Check /> Reunión 1 hecha
                </DropdownMenuItem>
              )}
              {["REUNION_1_HECHA", "REUNION_2"].includes(item.estado) && (
                <DropdownMenuItem onSelect={() => iniciar(async () => void avisar(await cambiarEstado(item.contacto_id, "PROPUESTA_ENVIADA")))}>
                  <Check /> Propuesta enviada
                </DropdownMenuItem>
              )}
              {["REUNION_1_HECHA", "PROPUESTA_ENVIADA"].includes(item.estado) && (
                <>
                  <DropdownMenuItem onSelect={() => iniciar(async () => void avisar(await cambiarEstado(item.contacto_id, "REUNION_2")))}>
                    <Check /> Reunión 2
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => iniciar(async () => void avisar(await cambiarEstado(item.contacto_id, "GANADO"), "¡Ganado! 🎉"))}>
                    <Check /> Ganado
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => iniciar(async () => void avisar(await cambiarEstado(item.contacto_id, "PERDIDO")))}>
                    <X /> Perdido
                  </DropdownMenuItem>
                </>
              )}
              {e && (
                <DropdownMenuItem asChild>
                  <Link href={`/empresas/${encodeURIComponent(e.place_id)}`}>
                    <ExternalLink /> Ver ficha de la empresa
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => iniciar(async () => (avisar(await cambiarEstado(item.contacto_id, "DESCARTADO"), "Descartado") ? alTerminar() : undefined))}>
                <X /> Descartar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  iniciar(async () => (avisar(await cambiarEstado(item.contacto_id, "NO_CONTACTAR", "Marcado a mano"), "No se le volverá a escribir") ? alTerminar() : undefined))
                }
              >
                <Ban /> No contactar nunca más
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

function WhatsAppIcono({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.08c-.24.68-1.41 1.3-1.95 1.38-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36h.56c.18.01.42-.07.66.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.2-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.42.29.14.46.12.63-.07.17-.2.72-.84.92-1.13.19-.29.38-.24.65-.14.26.1 1.68.79 1.97.94.29.14.48.21.55.33.07.12.07.7-.17 1.38Z" />
    </svg>
  );
}
