import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import CAPjs from "./captacion";
import { ESTADO_TRAS_PLANTILLA } from "./constantes";
import { ajustarSaludo, nombreCorto, varsReunion } from "./mensajes";
import type { Contacto, Contexto, Empresa } from "./tipos";


/* eslint-disable @typescript-eslint/no-explicit-any */
type Fase = { esperas: number[]; seguimientos: string[]; cierre?: string };
/** Tipos de la lógica central (lib/captacion.js, compartida con los scripts y n8n). */
type CapApi = {
  UMBRALES_DEFECTO: { revisionBase: number; A: number; B: number };
  FASES: Record<string, Fase>;
  hoyBolivia(): string;
  ahoraBolivia(): string;
  normalizarFecha(v: unknown): string | null;
  esDiaHabil(fecha: string, feriados?: unknown[], ciudad?: string | null): boolean;
  sumarDiasHabiles(fecha: string, n: number, feriados?: unknown[], ciudad?: string | null): string;
  diaHabilAnterior(fecha: string, feriados?: unknown[], ciudad?: string | null): string;
  normalizarTelefono(raw: string, ciudad?: string | null): { e164: string; tipo: string; nacional: string };
  normalizarNombre(n: string): string;
  contarSucursales(nombres: string[]): Map<string, number>;
  puntajeBase(e: Record<string, unknown>): { puntaje: number; descartar: boolean; detalle: string[] };
  prioridad(final: unknown, umbrales?: { revisionBase: number; A: number; B: number }): string;
  canalInicial(telTipo: string | null | undefined): string;
  mapearPlace(place: any, consulta: any): Record<string, any>;
  rellenarPlantilla(texto: string, vars: Record<string, unknown>): { texto: string; faltantes: string[] };
  insertarDato(texto: string, dato: string): string;
  variablesMensaje(a: { config: any; empresa: any; contacto: any }): Record<string, unknown>;
  elegirPrimeraPlantilla(c: any): { plantilla: string; accion: string };
  procesarEvento(c: any, ev: any, ctx: any): any;
  armarCola(contactos: any[], opts: any): any;
};
const CAP = CAPjs as unknown as CapApi;

type SB = SupabaseClient;

const PLANTILLAS_CON_DATO = ["GER_DERIVADO", "GER_FRIO"];

export const hoy = () => CAP.hoyBolivia();

export async function cargarContexto(sb: SB): Promise<Contexto> {
  const [c, p, f] = await Promise.all([
    sb.from("config").select("clave, valor"),
    sb.from("plantillas").select("id, texto"),
    sb.from("feriados").select("fecha, ambito"),
  ]);
  for (const r of [c, p, f]) if (r.error) throw new Error(r.error.message);
  return {
    config: Object.fromEntries((c.data ?? []).map((x) => [x.clave, x.valor ?? ""])),
    plantillas: Object.fromEntries((p.data ?? []).map((x) => [x.id, x.texto])),
    feriados: (f.data ?? []).map((x) => ({ fecha: x.fecha, ambito: x.ambito })),
  };
}

export function umbrales(ctx: Contexto) {
  return {
    revisionBase: Number(ctx.config.umbral_revision_base) || CAP.UMBRALES_DEFECTO.revisionBase,
    A: Number(ctx.config.umbral_A) || CAP.UMBRALES_DEFECTO.A,
    B: Number(ctx.config.umbral_B) || CAP.UMBRALES_DEFECTO.B,
  };
}

export function prioridadDe(e: Pick<Empresa, "puntaje_final" | "puntaje_revision" | "puntaje_base">, ctx: Contexto) {
  if (e.puntaje_base == null && e.puntaje_revision == null) return "";
  return CAP.prioridad(e.puntaje_final, umbrales(ctx)) as "A" | "B" | "C" | "";
}

/** Límite de chats nuevos por día: semana 1 o semana 2+ según config. */
export function limiteNuevos(ctx: Contexto, fecha = hoy()) {
  const inicio = ctx.config.fecha_inicio || "2026-11-09";
  const finSem1 = CAP.sumarDiasHabiles(inicio, 5, ctx.feriados);
  const sem1 = Number(ctx.config.limite_nuevos_dia_sem1) || 20;
  const sem2 = Number(ctx.config.limite_nuevos_dia_sem2) || 35;
  return fecha < finSem1 ? sem1 : sem2;
}

export function renderMensaje(idPlantilla: string | null | undefined, ctx: Contexto, empresa: Partial<Empresa> | null, contacto: Partial<Contacto>) {
  if (!idPlantilla) return { texto: "", faltantes: [] as string[] };
  const base = ctx.plantillas[idPlantilla];
  if (!base) return { texto: "", faltantes: [`plantilla ${idPlantilla}`] };
  const emp = empresa ? { ...empresa, empresa: nombreCorto(empresa.empresa ?? "") } : {};
  const vars = { ...CAP.variablesMensaje({ config: ctx.config, empresa: emp, contacto }), ...varsReunion(contacto) };
  const r = CAP.rellenarPlantilla(base, vars);
  let texto = r.texto;
  const faltantes = r.faltantes;
  if (PLANTILLAS_CON_DATO.includes(idPlantilla) && empresa?.dato_personalizacion) {
    texto = CAP.insertarDato(texto, empresa.dato_personalizacion);
  }
  return { texto: ajustarSaludo(texto), faltantes };
}

async function empresaDe(sb: SB, placeId: string | null) {
  if (!placeId) return null;
  const { data } = await sb.from("empresas").select("*").eq("place_id", placeId).maybeSingle();
  return (data as Empresa | null) ?? null;
}

export type EventoMotor =
  | { tipo: "cambio_estado"; estado: string }
  | { tipo: "envio" }
  | { tipo: "respuesta"; texto: string }
  | { tipo: "nota"; texto: string }
  | { tipo: "vencimiento" };

/**
 * Aplica un evento al contacto con la lógica del plan (lib/captacion.js) y lo guarda:
 * cambios del contacto, mensaje siguiente, fila en eventos y acciones (exclusión, empresa).
 */
export async function aplicarEvento(
  sb: SB,
  contactoId: string,
  evento: EventoMotor,
  opts: { usuario: string; ctx?: Contexto; extra?: Partial<Contacto>; nota?: string; materialId?: string }
) {
  const ctx = opts.ctx ?? (await cargarContexto(sb));
  const { data: c0, error } = await sb.from("contactos").select("*").eq("contacto_id", contactoId).single();
  if (error || !c0) throw new Error(`No existe el contacto ${contactoId}`);
  const empresa = await empresaDe(sb, c0.place_id);
  const contacto = { ...(c0 as Contacto), ...(opts.extra ?? {}) };

  let empresaYaContactada = false;
  if (contacto.place_id) {
    const { count } = await sb
      .from("eventos")
      .select("id", { count: "exact", head: true })
      .eq("place_id", contacto.place_id)
      .eq("primer_contacto", true);
    empresaYaContactada = (count ?? 0) > 0;
  }

  const r = CAP.procesarEvento({ ...contacto, ciudad: empresa?.ciudad ?? null }, evento, {
    hoy: hoy(),
    feriados: ctx.feriados,
    empresaYaContactada,
    ahora: CAP.ahoraBolivia(),
    registradoPor: opts.usuario,
  }) as {
    cambios: Partial<Contacto>;
    acciones: string[];
    evento: null | { estado_anterior: string; estado_nuevo: string; canal: string; variante: string; primer_contacto: string; nota: string };
    avisos: string[];
  };

  const cambios: Partial<Contacto> = { ...(opts.extra ?? {}), ...r.cambios };
  for (const k of ["fecha_proxima", "fecha_ultimo_envio"] as const) {
    if (cambios[k] === "") cambios[k] = null;
  }
  if ("plantilla_siguiente" in r.cambios) {
    cambios.mensaje_siguiente = renderMensaje(r.cambios.plantilla_siguiente, ctx, empresa, { ...contacto, ...cambios }).texto || null;
  }
  if (Object.keys(cambios).length) {
    const { error: e1 } = await sb.from("contactos").update(cambios).eq("contacto_id", contactoId);
    if (e1) throw new Error(e1.message);
  }

  if (r.evento) {
    const nota = [r.evento.nota, opts.nota].filter(Boolean).join(" · ") || null;
    const { error: e2 } = await sb.from("eventos").insert({
      contacto_id: contactoId,
      place_id: contacto.place_id,
      estado_anterior: r.evento.estado_anterior || null,
      estado_nuevo: r.evento.estado_nuevo,
      canal: contacto.canal,
      variante: contacto.variante_mensaje,
      ciudad: empresa?.ciudad ?? null,
      primer_contacto: r.evento.primer_contacto === "SI",
      registrado_por: opts.usuario,
      nota,
      material_id: opts.materialId ?? null,
    });
    if (e2) throw new Error(e2.message);
  }

  const nuevo = (cambios.estado ?? contacto.estado) as string;
  if (CAP.FASES[nuevo] && empresa && ["NUEVA", "EN_REVISION", "LISTA"].includes(empresa.estado_empresa)) {
    await sb.from("empresas").update({ estado_empresa: "EN_CURSO" }).eq("place_id", empresa.place_id);
  }
  for (const a of r.acciones) {
    if (a === "agregar_exclusion") {
      await sb.from("exclusion").insert({
        telefono_e164: contacto.telefono_e164,
        place_id: contacto.place_id,
        linkedin_url: contacto.linkedin_url,
        correo: contacto.correo,
        motivo: evento.tipo === "respuesta" ? "Pidió no recibir más mensajes" : opts.nota || "Marcado como NO_CONTACTAR",
        contacto_id: contactoId,
      });
    } else if (a === "marcar_empresa_no_contactar" && contacto.place_id) {
      await sb.from("empresas").update({ estado_empresa: "NO_CONTACTAR" }).eq("place_id", contacto.place_id);
    }
  }
  return { avisos: r.avisos, acciones: r.acciones, estado: nuevo };
}

/** Qué evento registrar cuando se confirma un envío desde la cola. */
export function eventoDeEnvio(c: Pick<Contacto, "estado" | "plantilla_siguiente">): EventoMotor | null {
  if (CAP.FASES[c.estado]) return { tipo: "envio" };
  const destino = c.plantilla_siguiente ? ESTADO_TRAS_PLANTILLA[c.plantilla_siguiente] : undefined;
  if (destino) return { tipo: "cambio_estado", estado: destino };
  return null;
}

/** Crea el contacto de recepción de una empresa aprobada, listo para la cola. */
export async function crearContactoRecepcion(sb: SB, empresa: Empresa, ctx: Contexto, usuario: string) {
  const { data: existente } = await sb.from("contactos").select("contacto_id").eq("place_id", empresa.place_id).eq("rol_contacto", "recepcion").maybeSingle();
  if (existente) return existente.contacto_id as string;
  const { count } = await sb.from("contactos").select("contacto_id", { count: "exact", head: true }).eq("rol_contacto", "recepcion");
  const variante = (count ?? 0) % 2 === 0 ? "A" : "B";
  const canal = CAP.canalInicial(empresa.tel_tipo);
  return crearContacto(
    sb,
    {
      place_id: empresa.place_id,
      rol_contacto: "recepcion",
      origen_contacto: "ficha_google",
      canal,
      telefono_e164: empresa.tel_publico,
      variante_mensaje: variante,
    },
    empresa,
    ctx,
    usuario
  );
}

/** Inserta un contacto en estado LISTO con su primera plantilla y mensaje. */
export async function crearContacto(sb: SB, datos: Partial<Contacto>, empresa: Empresa | null, ctx: Contexto, usuario: string) {
  const p = CAP.elegirPrimeraPlantilla(datos) as { plantilla: string; accion: string };
  const fila: Partial<Contacto> = {
    ...datos,
    estado: "LISTO",
    n_envios_sin_resp: 0,
    plantilla_siguiente: p.plantilla || null,
    proxima_accion: p.accion,
    fecha_proxima: CAP.sumarDiasHabiles(hoy(), 0, ctx.feriados, empresa?.ciudad ?? null),
  };
  fila.mensaje_siguiente = renderMensaje(p.plantilla, ctx, empresa, fila).texto || null;
  const { data, error } = await sb.from("contactos").insert(fila).select("contacto_id").single();
  if (error) throw new Error(error.message);
  await sb.from("eventos").insert({
    contacto_id: data.contacto_id,
    place_id: fila.place_id,
    estado_anterior: null,
    estado_nuevo: "LISTO",
    canal: fila.canal,
    variante: fila.variante_mensaje,
    ciudad: empresa?.ciudad ?? null,
    primer_contacto: false,
    registrado_por: usuario,
  });
  return data.contacto_id as string;
}

/** Cierra solos los contactos con plazo vencido y sin mensajes restantes. */
export async function procesarVencimientos(sb: SB, ctx: Contexto, usuario: string) {
  const fases = Object.keys(CAP.FASES);
  const { data } = await sb.from("contactos").select("contacto_id, estado, n_envios_sin_resp").in("estado", fases).lte("fecha_proxima", hoy());
  let cerrados = 0;
  for (const c of data ?? []) {
    const f = CAP.FASES[c.estado];
    if (f && c.n_envios_sin_resp >= f.esperas.length) {
      await aplicarEvento(sb, c.contacto_id, { tipo: "vencimiento" }, { usuario, ctx });
      cerrados++;
    }
  }
  return cerrados;
}

export const FASES = CAP.FASES;
export const sumarDiasHabiles = CAP.sumarDiasHabiles;
export { CAP };
