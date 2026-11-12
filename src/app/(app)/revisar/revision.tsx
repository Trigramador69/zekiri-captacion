"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronRight, Globe, Loader2, MapPin, Phone, Search, SkipForward, Star, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Prioridad } from "@/components/comunes";
import { descartarEmpresa, deshacerAprobacion, restaurarEmpresa, revisarEmpresa } from "@/app/acciones";
import { toast } from "sonner";
import { CIUDADES, MOTIVOS_DESCARTE, SENALES_REVISION } from "@/lib/constantes";
import { mapsLink, nombreCorto, telLegible } from "@/lib/mensajes";
import type { Empresa } from "@/lib/tipos";
import { cn } from "@/lib/utils";

type U = { revisionBase: number; A: number; B: number };

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function Revision({ empresas, umbrales, inicial }: { empresas: Empresa[]; umbrales: U; inicial?: string }) {
  const [hechas, setHechas] = useState<Set<string>>(new Set());
  const [saltadas, setSaltadas] = useState<string[]>([]);
  const [elegida, setElegida] = useState<string | null>(inicial ?? null);
  // Si llega otra empresa por la dirección (por ejemplo, recién agregada a mano), abrirla.
  useEffect(() => {
    if (inicial) setElegida(inicial);
  }, [inicial]);
  const [busqueda, setBusqueda] = useState("");
  const [sector, setSector] = useState("todos");
  const [verLista, setVerLista] = useState(false);

  // Orden de trabajo: las saltadas van al final.
  const pendientes = useMemo(() => {
    const p = empresas.filter((e) => !hechas.has(e.place_id));
    return [...p.filter((e) => !saltadas.includes(e.place_id)), ...p.filter((e) => saltadas.includes(e.place_id))];
  }, [empresas, hechas, saltadas]);
  const actual = pendientes.find((e) => e.place_id === elegida) ?? pendientes[0];

  const sectores = useMemo(() => [...new Set(empresas.map((e) => e.sector).filter(Boolean))].sort() as string[], [empresas]);
  const lista = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return pendientes.filter((e) => (sector === "todos" || e.sector === sector) && (!q || sinTildes(e.empresa).includes(q)));
  }, [pendientes, busqueda, sector]);

  /** Después de aprobar, descartar o saltar: la siguiente de la lista filtrada (o de todas). */
  const siguienteDe = (id: string) => {
    const base = lista.some((e) => e.place_id === id) ? lista : pendientes;
    const i = base.findIndex((e) => e.place_id === id);
    return base.slice(i + 1).find((e) => e.place_id !== id)?.place_id ?? base.find((e) => e.place_id !== id)?.place_id ?? null;
  };

  const elegir = (id: string) => {
    setElegida(id);
    setVerLista(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const panelLista = (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar empresa…" className="h-9 pl-8" />
        </div>
        {sectores.length > 1 && (
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            aria-label="Sector"
          >
            <option value="todos">Todos los sectores</option>
            {sectores.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        )}
      </div>
      <ul className="max-h-[55vh] overflow-y-auto lg:max-h-[calc(100dvh-330px)]">
        {lista.map((e) => {
          const sel = e.place_id === actual?.place_id;
          return (
            <li key={e.place_id} className="border-b last:border-b-0">
              <button
                onClick={() => elegir(e.place_id)}
                className={cn("relative flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors", sel ? "bg-primary/[0.08]" : "hover:bg-muted/60")}
              >
                {sel && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" />}
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums", sel ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {e.puntaje_base}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", sel && "font-medium")}>{e.empresa}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {e.sector}
                    {saltadas.includes(e.place_id) ? " · saltada" : ""}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">{e.ciudad}</span>
              </button>
            </li>
          );
        })}
        {lista.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Sin resultados.</li>}
      </ul>
    </div>
  );

  return (
    <div className="grid [&>*]:min-w-0 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {/* Celular: abrir la lista para elegir otra empresa */}
        <button
          onClick={() => setVerLista((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm font-medium lg:hidden"
        >
          <span>{verLista ? "Ocultar lista" : "Elegir otra empresa"}</span>
          <span className="text-muted-foreground">{pendientes.length} por revisar</span>
        </button>
        {verLista && <div className="lg:hidden">{panelLista}</div>}
        {actual ? (
          <Tarjeta
            key={actual.place_id}
            e={actual}
            u={umbrales}
            alTerminar={(accion, mensaje) => {
              const id = actual.place_id;
              const sig = siguienteDe(id);
              setHechas((h) => new Set(h).add(id));
              setElegida(sig);
              toast.success(mensaje, {
                duration: 10000,
                action: {
                  label: "Deshacer",
                  onClick: async () => {
                    const r = accion === "aprobada" ? await deshacerAprobacion(id) : await restaurarEmpresa(id);
                    if (!r.ok) return void toast.error(r.error ?? "No se pudo deshacer");
                    setHechas((h) => {
                      const n = new Set(h);
                      n.delete(id);
                      return n;
                    });
                    setElegida(id);
                    toast.info("Vuelve a estar en revisión");
                  },
                },
              });
            }}
            alSaltar={() => {
              const sig = siguienteDe(actual.place_id);
              setSaltadas((s) => [...s.filter((x) => x !== actual.place_id), actual.place_id]);
              setElegida(sig);
            }}
          />
        ) : (
          <div className="rounded-2xl border border-dashed p-12 text-center">
            <p className="text-lg font-semibold">¡Revisión terminada!</p>
            <p className="text-sm text-muted-foreground">Las aprobadas ya están en la cola.</p>
          </div>
        )}
      </div>
      <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Progreso</p>
            <p className="text-sm tabular-nums text-muted-foreground">
              {hechas.size} / {empresas.length}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(100 * hechas.size) / Math.max(1, empresas.length)}%` }} />
          </div>
        </div>
        <div className="hidden lg:block">{panelLista}</div>
        <p className="hidden text-xs leading-relaxed text-muted-foreground lg:block">
          Toca cualquier empresa para revisarla. Atajos: <kbd className="rounded border bg-muted px-1">1</kbd>–<kbd className="rounded border bg-muted px-1">5</kbd> señales ·{" "}
          <kbd className="rounded border bg-muted px-1">Enter</kbd> aprobar · <kbd className="rounded border bg-muted px-1">S</kbd> saltar
        </p>
      </aside>
    </div>
  );
}

function Tarjeta({ e, u, alTerminar, alSaltar }: { e: Empresa; u: U; alTerminar: (accion: "aprobada" | "descartada", mensaje: string) => void; alSaltar: () => void }) {
  const [senales, setSenales] = useState<Set<string>>(new Set());
  const [dato, setDato] = useState(e.dato_personalizacion ?? "");
  const [linkedin, setLinkedin] = useState(e.linkedin_empresa ?? "");
  const [descartando, setDescartando] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const revision = SENALES_REVISION.filter((s) => senales.has(s.id)).reduce((a, s) => a + s.puntos, 0);
  const final = (e.puntaje_base ?? 0) + revision;
  const prioridad = final >= u.A ? "A" : final >= u.B ? "B" : "C";

  const alternar = (id: string) =>
    setSenales((prev) => {
      const s = new Set(prev);
      const def = SENALES_REVISION.find((x) => x.id === id);
      if (s.has(id)) s.delete(id);
      else {
        s.add(id);
        if (def && "excluye" in def) s.delete(def.excluye);
      }
      return s;
    });

  const aprobar = () =>
    iniciar(async () => {
      const empleados = senales.has("li_201") ? "201-500" : senales.has("li_51") ? "51-200" : undefined;
      const r = await revisarEmpresa(e.place_id, { puntaje_revision: revision, dato_personalizacion: dato.trim(), linkedin_empresa: linkedin.trim(), empleados_li: empleados });
      if (!r.ok) return void toast.error(r.error ?? "No se pudo guardar");
      alTerminar("aprobada", prioridad === "C" ? `${nombreCorto(e.empresa)} guardada como C (no entra a la cola)` : `${nombreCorto(e.empresa)} aprobada como ${prioridad}: ya está en la cola`);
    });

  const descartar = (motivo: string) =>
    iniciar(async () => {
      const r = await descartarEmpresa(e.place_id, motivo);
      if (!r.ok) return void toast.error(r.error ?? "No se pudo descartar");
      alTerminar("descartada", `${nombreCorto(e.empresa)} descartada: ${motivo.toLowerCase()}`);
    });

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=dialog]")) {
        // Enter en los campos de la tarjeta aprueba; en el buscador de la lista, no.
        if (ev.key === "Enter" && t.tagName === "INPUT" && t.closest("[data-tarjeta-revision]") && !pendiente) aprobar();
        return;
      }
      const n = Number(ev.key);
      if (n >= 1 && n <= SENALES_REVISION.length) alternar(SENALES_REVISION[n - 1].id);
      else if (ev.key === "Enter" && !pendiente) aprobar();
      else if (ev.key.toLowerCase() === "s") alSaltar();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const busqueda = encodeURIComponent(nombreCorto(e.empresa));
  const detalle = (e.puntaje_detalle ?? "").split(/\s*[·;]\s*/).filter(Boolean);

  return (
    <article data-tarjeta-revision className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className="space-y-3 border-b p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {e.sector} · {CIUDADES[e.ciudad as keyof typeof CIUDADES] ?? e.ciudad}
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{e.empresa}</h2>
            {e.direccion && <p className="mt-1 text-sm text-muted-foreground">{e.direccion}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">{e.puntaje_base}</p>
            <p className="text-[11px] text-muted-foreground">base / 10</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {detalle.map((d) => (
            <span key={d} className={cn("rounded-full px-2 py-0.5 text-xs", d.startsWith("-") ? "bg-destructive/10 text-destructive" : "bg-muted")}>
              {d}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Star className="size-4 text-muted-foreground" /> {e.resenas} reseñas
          </span>
          {e.sucursales > 1 && (
            <span className="inline-flex items-center gap-1.5">
              <Store className="size-4 text-muted-foreground" /> {e.sucursales} sucursales
            </span>
          )}
          {e.tel_publico && (
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-4 text-muted-foreground" /> {telLegible(e.tel_publico)} <span className="text-muted-foreground">({e.tel_tipo})</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" asChild>
            <a href={mapsLink(e.place_id, e.empresa)} target="_blank" rel="noopener noreferrer">
              <MapPin /> Maps
            </a>
          </Button>
          {e.web && (
            <Button variant="outline" size="sm" asChild>
              <a href={e.web} target="_blank" rel="noopener noreferrer">
                <Globe /> Sitio
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <a href={`https://www.linkedin.com/search/results/companies/?keywords=${busqueda}`} target="_blank" rel="noopener noreferrer">
              <Search /> LinkedIn
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`https://www.google.com/search?q=${busqueda}+${encodeURIComponent(CIUDADES[e.ciudad as keyof typeof CIUDADES] ?? "")}+gerente`} target="_blank" rel="noopener noreferrer">
              <Search /> Google
            </a>
          </Button>
        </div>
      </header>

      <div className="grid [&>*]:min-w-0 gap-6 p-5 sm:p-6 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Señales de revisión</p>
          {SENALES_REVISION.map((s, i) => {
            const on = senales.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => alternar(s.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                  on ? "border-primary bg-primary/[0.07]" : "hover:bg-muted/60"
                )}
              >
                <span className={cn("flex size-5 items-center justify-center rounded-md border", on && "border-primary bg-primary text-primary-foreground")}>
                  {on && <Check className="size-3.5" />}
                </span>
                <span className="flex-1">{s.etiqueta}</span>
                <span className="text-xs font-semibold text-muted-foreground">+{s.puntos}</span>
                <kbd className="hidden rounded border bg-muted px-1 text-[10px] text-muted-foreground lg:inline">{i + 1}</kbd>
              </button>
            );
          })}
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-xl bg-muted/50 p-4">
            <Prioridad valor={prioridad} className="size-10 text-lg" />
            <div className="text-sm">
              <p className="font-medium">
                Final {final} <span className="text-muted-foreground">= {e.puntaje_base} + {revision}</span>
              </p>
              <p className="text-muted-foreground">{prioridad === "C" ? "Queda en C: no entra a la cola todavía." : prioridad === "A" ? "Contactar esta semana, mensaje personalizado." : "Entra a la cola normal."}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dato">Dato concreto (para personalizar)</Label>
            <Input id="dato" value={dato} onChange={(ev) => setDato(ev.target.value)} placeholder="Ej.: tienen 4 sucursales en Santa Cruz" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="li">LinkedIn de la empresa (opcional)</Label>
            <Input id="li" value={linkedin} onChange={(ev) => setLinkedin(ev.target.value)} placeholder="https://www.linkedin.com/company/…" />
          </div>
        </div>
      </div>

      <footer className="border-t bg-muted/30 p-4 sm:px-6">
        {descartando ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">¿Por qué la descartas?</p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_DESCARTE.map((m) => (
                <Button key={m} variant="outline" size="sm" disabled={pendiente} onClick={() => descartar(m)}>
                  {m}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setDescartando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDescartando(true)}>
                <X /> Descartar
              </Button>
              <Button variant="ghost" onClick={alSaltar}>
                <SkipForward /> Saltar
              </Button>
            </div>
            <Button size="lg" className="h-11 sm:ml-auto sm:min-w-56" onClick={aprobar} disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Check />} {prioridad !== "C" ? `Aprobar como ${prioridad}` : "Guardar como C"} <ChevronRight />
            </Button>
          </div>
        )}
      </footer>
    </article>
  );
}
