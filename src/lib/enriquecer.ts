import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CAP } from "./motor";
import { leerSitio } from "./sitio";

type Fila = {
  place_id: string;
  web: string | null;
  sector: string | null;
  resenas: number;
  sucursales: number;
  tel_tipo: string | null;
  whatsapp: string | null;
  correo: string | null;
  redes: Record<string, string> | null;
  linkedin_empresa: string | null;
  estado_empresa: string;
  puntaje_base: number | null;
};

const COLUMNAS = "place_id, web, sector, resenas, sucursales, tel_tipo, whatsapp, correo, redes, linkedin_empresa, estado_empresa, puntaje_base";

/** Puntaje base contando el WhatsApp del sitio como celular visible. */
export function puntajeConWhatsapp(f: { resenas: number; web: string | null; sector: string | null; tel_tipo: string | null; sucursales: number; whatsapp: string | null }) {
  const pb = CAP.puntajeBase({ resenas: f.resenas, web: f.web, sector: f.sector, telTipo: f.whatsapp ? "celular" : f.tel_tipo, sucursales: f.sucursales });
  const detalle = pb.detalle.map((d) => (f.whatsapp && f.tel_tipo !== "celular" && d.includes("celular visible") ? d.replace("celular visible", "WhatsApp en su web") : d));
  return { puntaje: pb.puntaje, detalle: detalle.join(" · ") || "sin señales" };
}

/**
 * Lee el sitio de las empresas indicadas (o de las pendientes) y guarda WhatsApp, correo y redes.
 * Solo completa datos vacíos; si aparece un WhatsApp, recalcula el puntaje de las que aún no se revisaron.
 */
export async function leerSitiosPendientes(sb: SupabaseClient, opciones: { ids?: string[]; limite?: number; presupuestoMs?: number } = {}) {
  const { ids, limite = 15, presupuestoMs = 25_000 } = opciones;
  const fin = Date.now() + presupuestoMs;
  let q = sb.from("empresas").select(COLUMNAS).is("web_leida", null).not("web", "is", null);
  q = ids ? q.in("place_id", ids) : q.in("estado_empresa", ["NUEVA", "LISTA", "EN_CURSO"]).order("puntaje_base", { ascending: false });
  const { data, error } = await q.limit(ids ? ids.length : limite);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as Fila[];

  let leidas = 0;
  let conWhatsapp = 0;
  const cola = [...filas];
  const trabajador = async () => {
    while (cola.length && Date.now() < fin - 9000) {
      const f = cola.shift()!;
      const r = await leerSitio(f.web!, Math.min(8000, Math.max(3000, fin - Date.now() - 1000)));
      const cambios: Record<string, unknown> = { web_leida: new Date().toISOString() };
      const whatsapp = f.whatsapp ?? r.whatsapp;
      if (!f.whatsapp && r.whatsapp) cambios.whatsapp = r.whatsapp;
      if (!f.correo && r.correo) cambios.correo = r.correo;
      const redes = { ...r.redes, ...(f.redes ?? {}) };
      if (Object.keys(redes).length) cambios.redes = redes;
      if (!f.linkedin_empresa && r.redes.linkedin) cambios.linkedin_empresa = r.redes.linkedin;
      if (cambios.whatsapp && f.estado_empresa === "NUEVA" && f.tel_tipo !== "celular") {
        const pb = puntajeConWhatsapp({ ...f, whatsapp });
        cambios.puntaje_base = pb.puntaje;
        cambios.puntaje_detalle = pb.detalle;
        cambios.canal_inicial = "WhatsApp";
      }
      await sb.from("empresas").update(cambios).eq("place_id", f.place_id);
      leidas++;
      if (whatsapp) conWhatsapp++;
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajador));
  return { leidas, conWhatsapp, pendientes: filas.length - leidas };
}
