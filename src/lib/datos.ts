import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "./supabase/server";
import { CAP, cargarContexto, hoy, limiteNuevos, prioridadDe, procesarVencimientos } from "./motor";
import type { ContactoConEmpresa, Empresa } from "./tipos";
import { filtroRevisar } from "./constantes";

export const ESTADOS_ACCIONABLES = [
  "LISTO", "RESPONDIO", "LI_CONECTADO", "REUNION_AGENDADA", "REUNION_1_HECHA", "PROPUESTA_ENVIADA", "REUNION_2",
  ...Object.keys(CAP.FASES),
];

/** Sesión y perfil del usuario actual (una vez por request). */
export const usuarioActual = cache(async () => {
  const sb = await crearClienteServidor();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const user = { id: claims.sub, email: (claims.email as string | undefined) ?? "" };
  const { data: perfil } = await sb.from("perfiles").select("nombre, rol").eq("id", user.id).maybeSingle();
  return { sb, user, perfil, nombre: perfil?.nombre || user.email.split("@")[0] || "usuario" };
});

export const contexto = cache(async () => {
  const { sb } = await usuarioActual();
  return cargarContexto(sb);
});

/** Cuántos de esos contactos son de recepción: solo esos primeros mensajes (en frío) cuentan en el límite diario. */
async function primerosEnviosEnFrio(sb: Awaited<ReturnType<typeof usuarioActual>>["sb"], ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter(Boolean))] as string[];
  if (!unicos.length) return 0;
  const { data } = await sb.from("contactos").select("contacto_id, rol_contacto").in("contacto_id", unicos);
  const frio = new Set((data ?? []).filter((c) => !CAP.esDerivado(c)).map((c) => c.contacto_id));
  return ids.filter((id) => id && frio.has(id)).length;
}

export const contadores = cache(async () => {
  const { sb } = await usuarioActual();
  const ctx = await contexto();
  const umbral = Number(ctx.config.umbral_revision_base) || 5;
  const h = hoy();
  const [pend, nuevos, derivados, primerosHoy, revisar, resp] = await Promise.all([
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).in("estado", ESTADOS_ACCIONABLES.filter((e) => e !== "LISTO")).lte("fecha_proxima", h),
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).eq("estado", "LISTO").eq("rol_contacto", "recepcion").lte("fecha_proxima", h),
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).eq("estado", "LISTO").neq("rol_contacto", "recepcion").lte("fecha_proxima", h),
    sb.from("eventos").select("contacto_id").eq("estado_anterior", "LISTO").neq("estado_nuevo", "LISTO").gte("fecha", `${h}T00:00:00-04:00`),
    sb.from("empresas").select("place_id", { count: "exact", head: true }).eq("estado_empresa", "NUEVA").or(filtroRevisar(umbral)),
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).in("estado", ["RESPONDIO", "LI_CONECTADO"]),
  ]);
  // Igual que la cola: los nuevos de recepción no pasan del límite del día; los derivados (gerentes) no cuentan.
  const enviadosHoy = await primerosEnviosEnFrio(sb, (primerosHoy.data ?? []).map((e) => e.contacto_id));
  const cupo = Math.max(0, limiteNuevos(ctx, h) - enviadosHoy);
  const cola = (pend.count ?? 0) + (derivados.count ?? 0) + Math.min(nuevos.count ?? 0, cupo);
  return { cola, revisar: revisar.count ?? 0, respondieron: resp.count ?? 0 };
});

export type ItemCola = ContactoConEmpresa & { prioridad: string; vencido: boolean; tipo: "pendiente" | "nuevo" };

/** Cola del día: cierra vencidos, aplica exclusión, ordena pendientes → nuevos A → nuevos B y respeta el límite diario. */
export async function colaDelDia() {
  const { sb, nombre } = await usuarioActual();
  const ctx = await contexto();
  const cerrados = await procesarVencimientos(sb, ctx, nombre);
  const h = hoy();
  const inicioDia = `${h}T00:00:00-04:00`;
  const [cs, ex, envHoy] = await Promise.all([
    sb.from("contactos").select("*, empresas(*)").in("estado", ESTADOS_ACCIONABLES).or(`fecha_proxima.lte.${h},fecha_proxima.is.null`),
    sb.from("exclusion").select("telefono_e164, place_id, linkedin_url, correo"),
    sb.from("eventos").select("id, contacto_id, estado_anterior, estado_nuevo, primer_contacto").gte("fecha", inicioDia),
  ]);
  const contactos = (cs.data ?? []) as ContactoConEmpresa[];
  const empresasPorPlace: Record<string, Empresa & { prioridad: string }> = {};
  for (const c of contactos) if (c.empresas) empresasPorPlace[c.empresas.place_id] = { ...c.empresas, prioridad: prioridadDe(c.empresas, ctx) };

  const eventosHoy = envHoy.data ?? [];
  const nuevosHoy = await primerosEnviosEnFrio(
    sb,
    eventosHoy.filter((e) => e.estado_anterior === "LISTO" && e.estado_nuevo !== "LISTO").map((e) => e.contacto_id)
  );
  const enviosHoy = eventosHoy.filter((e) => e.estado_nuevo === "SEGUIMIENTO_ENVIADO" || (CAP.FASES[e.estado_nuevo] && e.estado_anterior !== e.estado_nuevo)).length;
  const limite = limiteNuevos(ctx, h);

  const r = CAP.armarCola(contactos, { hoy: h, exclusion: ex.data ?? [], empresasPorPlace, limiteNuevos: Math.max(0, limite - nuevosHoy) }) as {
    cola: (ContactoConEmpresa & { prioridad: string })[];
    fueraDeLimite: unknown[];
    excluidos: unknown[];
  };
  const items: ItemCola[] = r.cola.map((c) => ({
    ...c,
    vencido: c.estado !== "LISTO" && !!c.fecha_proxima && c.fecha_proxima < h,
    // Un gerente que nos pasaron se trabaja como respuesta pendiente, no como chat nuevo.
    tipo: c.estado === "LISTO" && !CAP.esDerivado(c) ? "nuevo" : "pendiente",
  }));
  return {
    items,
    limite,
    nuevosHoy,
    enviosHoy,
    fueraDeLimite: r.fueraDeLimite.length,
    excluidos: r.excluidos.length,
    cerrados,
    feriado: !CAP.esDiaHabil(h, ctx.feriados),
    hoy: h,
  };
}
