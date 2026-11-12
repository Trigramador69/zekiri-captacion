import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CAP } from "./motor";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
  "places.internationalPhoneNumber", "places.websiteUri", "places.rating", "places.userRatingCount",
  "places.types", "places.businessStatus", "nextPageToken",
].join(",");
const CIUDAD_TEXTO: Record<string, string> = { SCZ: "Santa Cruz de la Sierra", LPZ: "La Paz", CBBA: "Cochabamba" };

export type Consulta = { id: string; ciudad: string; zona: string | null; sector: string | null; termino: string };

export function textoConsulta(c: Consulta) {
  const lugar = c.zona ? `${c.zona}, ${CIUDAD_TEXTO[c.ciudad] ?? c.ciudad}` : CIUDAD_TEXTO[c.ciudad] ?? c.ciudad;
  return `${c.termino} en ${lugar}, Bolivia`;
}

type Place = Record<string, unknown> & { id: string };

async function buscar(c: Consulta, clave: string, maxPaginas = 3) {
  const lugares: Place[] = [];
  let token: string | undefined;
  let paginas = 0;
  do {
    const body: Record<string, unknown> = { textQuery: textoConsulta(c), regionCode: "BO", languageCode: "es", pageSize: 20 };
    if (token) body.pageToken = token;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": clave, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { places?: Place[]; nextPageToken?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`Google Places respondió ${res.status}: ${json.error?.message ?? res.statusText}`);
    paginas++;
    lugares.push(...(json.places ?? []));
    token = json.nextPageToken;
    if (token && paginas < maxPaginas) await new Promise((r) => setTimeout(r, 1500));
  } while (token && paginas < maxPaginas);
  return { lugares, paginas, quedabanMas: Boolean(token) };
}

/**
 * Corre una consulta de Places y guarda las empresas nuevas con su puntaje base.
 * No toca empresas que ya existen (las revisadas o en curso conservan sus datos).
 */
export async function ejecutarConsulta(sb: SupabaseClient, c: Consulta) {
  const clave = process.env.PLACES_API_KEY;
  if (!clave) throw new Error("Falta PLACES_API_KEY en las variables de entorno del servidor.");
  const r = await buscar(c, clave);
  const filas = r.lugares.map((p) => CAP.mapearPlace(p, c)) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  const ids = filas.map((f) => String(f.place_id));
  const { data: existentes } = await sb.from("empresas").select("place_id, empresa").in("place_id", ids);
  const yaEstan = new Set((existentes ?? []).map((e) => e.place_id));

  // Sucursales: cuenta nombres iguales en esta búsqueda y en las empresas ya guardadas de la ciudad.
  const { data: mismaCiudad } = await sb.from("empresas").select("place_id, empresa").eq("ciudad", c.ciudad).neq("estado_empresa", "DESCARTADA");
  const conteo = CAP.contarSucursales([...filas.map((f) => String(f.empresa)), ...(mismaCiudad ?? []).filter((e) => !ids.includes(e.place_id)).map((e) => e.empresa)]);
  const principalGuardada = new Map<string, string>();
  for (const e of mismaCiudad ?? []) {
    const k = CAP.normalizarNombre(e.empresa);
    if (!principalGuardada.has(k)) principalGuardada.set(k, e.empresa);
  }

  const nuevas = [];
  const principalNueva = new Map<string, string>();
  const ordenadas = filas
    .filter((f) => !yaEstan.has(String(f.place_id)))
    .map((f) => {
      const suc = conteo.get(CAP.normalizarNombre(f.empresa)) || 1;
      const pb = CAP.puntajeBase({ resenas: f.resenas, web: f.web, sector: f.sector, telTipo: f.tel_tipo, sucursales: suc, businessStatus: f.business_status });
      return { f, suc, pb };
    })
    .sort((a, b) => b.pb.puntaje - a.pb.puntaje);

  for (const { f, suc, pb } of ordenadas) {
    const k = CAP.normalizarNombre(f.empresa);
    let estado = pb.descartar ? "DESCARTADA" : "NUEVA";
    let motivo: string | null = pb.descartar ? "Cerrada en Google" : null;
    if (estado === "NUEVA" && suc >= 2) {
      const principal = principalGuardada.get(k) ?? principalNueva.get(k);
      if (principal) {
        estado = "DESCARTADA";
        motivo = `Sucursal de ${principal}`;
      } else principalNueva.set(k, String(f.empresa));
    }
    nuevas.push({
      place_id: f.place_id,
      empresa: f.empresa,
      ciudad: c.ciudad,
      zona: c.zona,
      sector: c.sector,
      consulta_origen: c.id,
      direccion: f.direccion || null,
      tel_publico: f.tel_publico || null,
      tel_tipo: f.tel_tipo,
      web: f.web || null,
      resenas: Number(f.resenas) || 0,
      sucursales: suc,
      puntaje_base: pb.puntaje,
      puntaje_detalle: pb.detalle.join(" · ") || "sin señales",
      estado_empresa: estado,
      motivo_descarte: motivo,
      canal_inicial: CAP.canalInicial(f.tel_tipo),
    });
  }
  if (nuevas.length) {
    const { error } = await sb.from("empresas").insert(nuevas);
    if (error) throw new Error(error.message);
  }
  await sb.from("consultas").update({ ultima_ejecucion: new Date().toISOString(), resultados: r.lugares.length }).eq("id", c.id);
  const umbral = 5;
  return {
    encontradas: r.lugares.length,
    nuevas: nuevas.length,
    paraRevisar: nuevas.filter((n) => n.estado_empresa === "NUEVA" && n.puntaje_base >= umbral).length,
    solicitudes: r.paginas,
    quedabanMas: r.quedabanMas,
  };
}
