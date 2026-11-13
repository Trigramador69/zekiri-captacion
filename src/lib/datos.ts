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

export const contadores = cache(async () => {
  const { sb } = await usuarioActual();
  const ctx = await contexto();
  const umbral = Number(ctx.config.umbral_revision_base) || 5;
  const h = hoy();
  const [pend, nuevos, enviadosHoy, revisar, resp] = await Promise.all([
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).in("estado", ESTADOS_ACCIONABLES.filter((e) => e !== "LISTO")).lte("fecha_proxima", h),
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).eq("estado", "LISTO").lte("fecha_proxima", h),
    sb.from("eventos").select("id", { count: "exact", head: true }).eq("estado_anterior", "LISTO").neq("estado_nuevo", "LISTO").gte("fecha", `${h}T00:00:00-04:00`),
    sb.from("empresas").select("place_id", { count: "exact", head: true }).eq("estado_empresa", "NUEVA").or(filtroRevisar(umbral)),
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).in("estado", ["RESPONDIO", "LI_CONECTADO"]),
  ]);
  // Igual que la cola: los nuevos no pasan del límite del día.
  const cupo = Math.max(0, limiteNuevos(ctx, h) - (enviadosHoy.count ?? 0));
  const cola = (pend.count ?? 0) + Math.min(nuevos.count ?? 0, cupo);
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
    sb.from("eventos").select("id, estado_anterior, estado_nuevo, primer_contacto").gte("fecha", inicioDia),
  ]);
  const contactos = (cs.data ?? []) as ContactoConEmpresa[];
  const empresasPorPlace: Record<string, Empresa & { prioridad: string }> = {};
  for (const c of contactos) if (c.empresas) empresasPorPlace[c.empresas.place_id] = { ...c.empresas, prioridad: prioridadDe(c.empresas, ctx) };

  const eventosHoy = envHoy.data ?? [];
  const nuevosHoy = eventosHoy.filter((e) => e.estado_anterior === "LISTO" && e.estado_nuevo !== "LISTO").length;
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
    tipo: c.estado === "LISTO" ? "nuevo" : "pendiente",
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
