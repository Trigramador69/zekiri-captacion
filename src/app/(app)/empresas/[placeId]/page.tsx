import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, MapPin, Phone, Star, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoBadge, EstadoEmpresaBadge, EventoBadge, Pagina, Prioridad } from "@/components/comunes";
import { contexto, usuarioActual } from "@/lib/datos";
import { prioridadDe } from "@/lib/motor";
import { CIUDADES, OBJECIONES, notaLegible } from "@/lib/constantes";
import { mapsLink, telLegible } from "@/lib/mensajes";
import type { Contacto, Empresa, Evento } from "@/lib/tipos";
import { AccionesContacto, AgregarContacto, AccionesEmpresa, DatosEmpresa, FichaTraspaso } from "./cliente";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const { sb } = await usuarioActual();
  const { data } = await sb.from("empresas").select("empresa").eq("place_id", decodeURIComponent(placeId)).maybeSingle();
  return { title: data?.empresa ?? "Empresa" };
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(iso));

export default async function FichaEmpresa({ params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const id = decodeURIComponent(placeId);
  const { sb, nombre } = await usuarioActual();
  const ctx = await contexto();
  const [{ data: e }, { data: cs }, { data: evs }, { data: perfiles }] = await Promise.all([
    sb.from("empresas").select("*").eq("place_id", id).maybeSingle(),
    sb.from("contactos").select("*").eq("place_id", id).order("creado"),
    sb.from("eventos").select("*").eq("place_id", id).order("fecha", { ascending: false }).limit(100),
    sb.from("perfiles").select("nombre"),
  ]);
  if (!e) notFound();
  const empresa = e as Empresa;
  const contactos = (cs ?? []) as Contacto[];
  const eventos = (evs ?? []) as Evento[];
  const nombrePorId = Object.fromEntries(contactos.map((c) => [c.contacto_id, c.nombre || (c.rol_contacto === "recepcion" ? "Recepción" : c.contacto_id)]));
  const prioridad = empresa.puntaje_revision != null ? prioridadDe(empresa, ctx) : "";
  const responsables = [...new Set([nombre, ...(perfiles ?? []).map((p) => p.nombre)].filter(Boolean))];
  const conReunion = contactos.find((c) => c.fecha_reunion);

  return (
    <Pagina>
      <Link href="/empresas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Empresas
      </Link>
      <header className="mb-6 flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoEmpresaBadge estado={empresa.estado_empresa} />
            <Prioridad valor={prioridad} />
            {empresa.motivo_descarte && <span className="text-xs text-muted-foreground">{empresa.motivo_descarte}</span>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{empresa.empresa}</h1>
          <p className="text-sm text-muted-foreground">
            {empresa.sector} · {CIUDADES[empresa.ciudad as keyof typeof CIUDADES] ?? empresa.ciudad}
            {empresa.direccion ? ` · ${empresa.direccion}` : ""}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {empresa.tel_publico && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-4 text-muted-foreground" /> {telLegible(empresa.tel_publico)} ({empresa.tel_tipo})
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Star className="size-4 text-muted-foreground" /> {empresa.resenas} reseñas
            </span>
            {empresa.sucursales > 1 && (
              <span className="inline-flex items-center gap-1.5">
                <Store className="size-4 text-muted-foreground" /> {empresa.sucursales} sucursales
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <div className="flex gap-6 text-center">
            {[
              ["Base", empresa.puntaje_base ?? "–"],
              ["Revisión", empresa.puntaje_revision ?? "–"],
              ["Final", empresa.puntaje_final],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-2xl font-semibold tabular-nums">{v}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={mapsLink(empresa.place_id, empresa.empresa)} target="_blank" rel="noopener noreferrer">
                <MapPin /> Maps
              </a>
            </Button>
            {empresa.web && (
              <Button variant="outline" size="sm" asChild>
                <a href={empresa.web} target="_blank" rel="noopener noreferrer">
                  <Globe /> Sitio
                </a>
              </Button>
            )}
            <AccionesEmpresa placeId={empresa.place_id} estado={empresa.estado_empresa} />
          </div>
        </div>
      </header>

      <div className="grid [&>*]:min-w-0 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Contactos</h2>
              <AgregarContacto placeId={empresa.place_id} />
            </div>
            {contactos.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sin contactos todavía. Aprueba la empresa en Revisar o agrega uno.
              </p>
            ) : (
              <ul className="space-y-3">
                {contactos.map((c) => (
                  <li key={c.contacto_id} className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {c.nombre || (c.rol_contacto === "recepcion" ? "Recepción" : "Sin nombre")}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {c.rol_contacto}
                            {c.cargo ? ` · ${c.cargo}` : ""} · {c.contacto_id}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {c.canal}
                          {c.telefono_e164 ? ` · ${telLegible(c.telefono_e164)}` : ""}
                          {c.correo ? ` · ${c.correo}` : ""}
                          {c.persona_derivo ? ` · lo pasó ${c.persona_derivo}` : ""}
                        </p>
                      </div>
                      <EstadoBadge estado={c.estado} />
                    </div>
                    {(c.proxima_accion || c.ultima_respuesta) && (
                      <div className="mt-3 space-y-1 text-sm">
                        {c.proxima_accion && (
                          <p>
                            <span className="text-muted-foreground">Próximo:</span> {c.proxima_accion}
                            {c.fecha_proxima ? ` · ${c.fecha_proxima}` : ""}
                          </p>
                        )}
                        {c.ultima_respuesta && <p className="rounded-lg bg-warning/10 px-3 py-2">“{c.ultima_respuesta}”</p>}
                        {c.objecion && <p className="text-muted-foreground">Objeción: {OBJECIONES[c.objecion]?.etiqueta ?? c.objecion}</p>}
                      </div>
                    )}
                    {!["NO_CONTACTAR", "GANADO", "PERDIDO", "DESCARTADO", "GERENTE_CONSEGUIDO"].includes(c.estado) && (
                      <AccionesContacto contacto={c} responsables={responsables} empresa={empresa.empresa} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-semibold">Historial</h2>
            {eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
            ) : (
              <ol className="relative space-y-4 border-l pl-5">
                {eventos.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <EventoBadge evento={ev.estado_nuevo} />
                      <span className="font-medium">{ev.contacto_id ? nombrePorId[ev.contacto_id] : ""}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmt(ev.fecha)} · {ev.registrado_por}
                        {ev.primer_contacto ? " · primer contacto" : ""}
                      </span>
                    </div>
                    {ev.nota && <p className="mt-1 text-sm text-muted-foreground">{notaLegible(ev.nota)}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <DatosEmpresa empresa={empresa} />
          {conReunion && <FichaTraspaso empresa={empresa} contacto={conReunion} contactos={contactos} />}
          {empresa.puntaje_detalle && (
            <section className="rounded-2xl border bg-card p-5 text-sm">
              <h3 className="mb-2 font-semibold">Puntaje base</h3>
              <p className="text-muted-foreground">{empresa.puntaje_detalle}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Búsqueda {empresa.consulta_origen} · alta {empresa.fecha_alta}
              </p>
            </section>
          )}
        </aside>
      </div>
    </Pagina>
  );
}
