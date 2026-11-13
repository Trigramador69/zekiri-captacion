import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CAP, cargarContexto, limiteNuevos, procesarVencimientos, renderMensaje } from "./motor";
import { enviarCorreo, remitente, smtpConfigurado } from "./correo";
import { ejecutarConsulta } from "./places";
import { esVirtual, horaBolivia24, nombreCorto, telLegible, waLink } from "./mensajes";
import type { Contacto, Contexto, Empresa } from "./tipos";

/*
 * Tareas que corren solas (n8n llama a /api/tareas cada 15 minutos):
 *  - cierra contactos vencidos sin mensajes restantes
 *  - resumen del día por correo (días hábiles, a la hora configurada)
 *  - aviso antes de cada reunión con el botón de WhatsApp y el enlace listos
 *  - reporte de la semana anterior (lunes)
 *  - búsquedas automáticas en Google Places (domingo a la noche)
 * Cada aviso se registra en `avisos_enviados` para no mandarlo dos veces.
 */

type SB = SupabaseClient;
const TZ = "America/La_Paz";

function ahoraBo(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, dia: String(p.weekday) };
}

function semanaIso(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((d.getTime() - primerJueves.getTime()) / 86400000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-S${String(n).padStart(2, "0")}`;
}

async function yaHecho(sb: SB, clave: string) {
  const { data } = await sb.from("avisos_enviados").select("clave").eq("clave", clave).maybeSingle();
  return Boolean(data);
}
async function marcar(sb: SB, clave: string, detalle = "") {
  await sb.from("avisos_enviados").upsert({ clave, detalle, enviado: new Date().toISOString() });
}

// ───────── Correo ─────────

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function plantillaCorreo(titulo: string, cuerpo: string, boton?: { texto: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1b1f24">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="font-weight:700;font-size:13px;letter-spacing:.08em;color:#2f7fd6;text-transform:uppercase;margin-bottom:8px">Captación Zékiri</div>
  <div style="background:#fff;border-radius:16px;padding:24px;border:1px solid #e3e7ec">
    <h1 style="font-size:20px;margin:0 0 16px">${esc(titulo)}</h1>
    ${cuerpo}
    ${boton ? `<p style="margin:24px 0 0"><a href="${esc(boton.url)}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">${esc(boton.texto)}</a></p>` : ""}
  </div>
  <p style="font-size:12px;color:#6b7480;margin-top:16px">Aviso automático. Se configura en Configuración → Integraciones.</p>
</div></body></html>`;
}

const fila = (k: string, v: string | number) => `<tr><td style="padding:6px 0;color:#5d6673">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:600">${esc(v)}</td></tr>`;

// ───────── Ejecutor ─────────

export type ResultadoTareas = { hecho: string[]; errores: string[] };

/**
 * `sb` debe ser el cliente con la clave secreta (las tareas no tienen sesión de usuario).
 * `appUrl` es la dirección de la web, para los botones de los correos.
 */
export async function ejecutarTareas(sb: SB, { appUrl, forzar = [] as string[] }: { appUrl: string; forzar?: string[] }): Promise<ResultadoTareas> {
  const hecho: string[] = [];
  const errores: string[] = [];
  const ctx = await cargarContexto(sb);
  const ahora = ahoraBo();
  const habil = CAP.esDiaHabil(ahora.fecha, ctx.feriados);

  // 1. Vencidos
  try {
    const n = await procesarVencimientos(sb, ctx, "automático");
    if (n) hecho.push(`${n} contactos cerrados sin respuesta`);
  } catch (e) {
    errores.push(`vencidos: ${msg(e)}`);
  }

  // Los avisos salen por el correo de Zoho (SMTP); llegan al correo configurado o al mismo remitente.
  const puedeEnviar = smtpConfigurado();
  const para = (ctx.config.correo_avisos || remitente()).trim();
  const correo = async (asunto: string, html: string) => {
    if (!puedeEnviar || !para) throw new Error("Falta configurar el correo de avisos (SMTP) en el servidor.");
    await enviarCorreo({ para, asunto, html });
  };

  // 2. Aviso antes de cada reunión
  const minAntes = Number(ctx.config.aviso_reunion_minutos ?? 60);
  if (minAntes > 0 && puedeEnviar) {
    try {
      const desde = new Date();
      const hasta = new Date(Date.now() + (minAntes + 15) * 60000);
      const { data: reus } = await sb
        .from("contactos")
        .select("*, empresas(*)")
        .eq("estado", "REUNION_AGENDADA")
        .gte("fecha_reunion", desde.toISOString())
        .lte("fecha_reunion", hasta.toISOString());
      for (const c of (reus ?? []) as (Contacto & { empresas: Empresa | null })[]) {
        const clave = `reunion:${c.contacto_id}:${c.fecha_reunion}`;
        if ((await yaHecho(sb, clave)) && !forzar.includes("reunion")) continue;
        if (new Date(c.fecha_reunion!).getTime() - Date.now() > minAntes * 60000 + 60000 && !forzar.includes("reunion")) continue;
        await correo(...correoReunion(c, ctx, appUrl));
        await marcar(sb, clave, c.empresas?.empresa ?? "");
        hecho.push(`aviso de reunión: ${c.empresas?.empresa ?? c.contacto_id}`);
      }
    } catch (e) {
      errores.push(`aviso de reunión: ${msg(e)}`);
    }
  }

  // 3. Resumen del día (+ reporte semanal los lunes)
  const horaResumen = (ctx.config.aviso_resumen_hora ?? "08:30").trim();
  const tocaResumen = horaResumen && habil && ahora.hora >= horaResumen;
  if (puedeEnviar && (tocaResumen || forzar.includes("resumen"))) {
    const clave = `resumen:${ahora.fecha}`;
    if (!(await yaHecho(sb, clave)) || forzar.includes("resumen")) {
      try {
        const [asunto, html] = await correoResumen(sb, ctx, ahora.fecha, appUrl, ahora.dia === "Mon" && ctx.config.aviso_reporte_semanal !== "NO");
        await correo(asunto, html);
        await marcar(sb, clave);
        hecho.push("resumen del día enviado");
      } catch (e) {
        errores.push(`resumen: ${msg(e)}`);
      }
    }
  }

  // 4. Búsquedas automáticas (domingo desde las 20:00)
  const nBusquedas = Number(ctx.config.busquedas_auto_semana ?? 0);
  if (nBusquedas > 0 && ((ahora.dia === "Sun" && ahora.hora >= "20:00") || forzar.includes("busquedas")) && process.env.PLACES_API_KEY) {
    const clave = `busquedas:${semanaIso(ahora.fecha)}`;
    if (!(await yaHecho(sb, clave)) || forzar.includes("busquedas")) {
      try {
        const { data: qs } = await sb
          .from("consultas")
          .select("*")
          .eq("activa", true)
          .order("ultima_ejecucion", { ascending: true, nullsFirst: true })
          .limit(Math.min(10, nBusquedas));
        const partes: string[] = [];
        for (const q of qs ?? []) {
          const r = await ejecutarConsulta(sb, q);
          partes.push(`${q.termino} (${q.ciudad}): ${r.nuevas} nuevas, ${r.paraRevisar} para revisar`);
        }
        await marcar(sb, clave, partes.join(" · "));
        hecho.push(`búsquedas automáticas: ${partes.join(" · ") || "ninguna activa"}`);
      } catch (e) {
        errores.push(`búsquedas: ${msg(e)}`);
      }
    }
  }

  await marcar(sb, "ultima_ejecucion", JSON.stringify({ hecho, errores }).slice(0, 2000));
  return { hecho, errores };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function correoReunion(c: Contacto & { empresas: Empresa | null }, ctx: Contexto, appUrl: string): [string, string] {
  const emp = c.empresas;
  const hora = horaBolivia24(c.fecha_reunion!);
  const virtual = esVirtual(c.modalidad_reunion);
  const plantilla = virtual ? "REU_ENLACE" : "REU_HOY";
  const texto = c.mensaje_siguiente && ["REU_ENLACE", "REU_HOY"].includes(c.plantilla_siguiente ?? "") ? c.mensaje_siguiente : renderMensaje(plantilla, ctx, emp, c).texto;
  const wa = c.telefono_e164 ? waLink(c.telefono_e164, texto) : "";
  const cuerpo = `
    <p style="margin:0 0 12px">A las <b>${esc(hora)}</b> tienes reunión con <b>${esc(c.nombre ?? "")}</b>${c.cargo ? ` (${esc(c.cargo)})` : ""} de <b>${esc(emp?.empresa ?? "")}</b>, ${esc(c.modalidad_reunion ?? "")}.</p>
    ${c.enlace_reunion ? `<p style="margin:0 0 12px">Enlace: <a href="${esc(c.enlace_reunion)}">${esc(c.enlace_reunion)}</a></p>` : virtual ? `<p style="margin:0 0 12px;color:#b42318">Todavía no hay enlace de ${esc(c.modalidad_reunion)}: agrégalo en la web antes de enviar.</p>` : ""}
    <p style="margin:0 0 8px;color:#5d6673">Mensaje listo para enviar${c.telefono_e164 ? ` a ${esc(telLegible(c.telefono_e164))}` : ""}:</p>
    <div style="background:#e7ffdb;border-radius:12px;padding:12px 14px;white-space:pre-wrap">${esc(texto)}</div>
    ${wa ? `<p style="margin:16px 0 0"><a href="${esc(wa)}" style="display:inline-block;background:#128c4a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Abrir WhatsApp con el mensaje</a></p>` : ""}
    <p style="margin:16px 0 0;font-size:13px;color:#5d6673">Después de enviarlo, regístralo en la web para que quede en el historial.</p>`;
  return [`Reunión a las ${hora} con ${nombreCorto(emp?.empresa ?? c.nombre ?? "")}: envía ${virtual ? "el enlace" : "la confirmación"}`, plantillaCorreo(`Reunión a las ${hora}`, cuerpo, { texto: "Abrir la conversación", url: `${appUrl}/conversaciones?c=${c.contacto_id}` })];
}

async function correoResumen(sb: SB, ctx: Contexto, fecha: string, appUrl: string, conReporte: boolean): Promise<[string, string]> {
  const acc = ["RESPONDIO", "LI_CONECTADO", "REUNION_AGENDADA", "REUNION_1_HECHA", "PROPUESTA_ENVIADA", "REUNION_2", ...Object.keys(CAP.FASES)];
  const inicioDia = `${fecha}T00:00:00-04:00`;
  const finDia = `${fecha}T23:59:59-04:00`;
  const [pend, nuevos, resp, reus, revisar] = await Promise.all([
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).in("estado", acc).lte("fecha_proxima", fecha),
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).eq("estado", "LISTO").lte("fecha_proxima", fecha),
    sb.from("contactos").select("contacto_id, nombre, ultima_respuesta, empresas(empresa)").eq("estado", "RESPONDIO").limit(5),
    sb.from("contactos").select("nombre, fecha_reunion, modalidad_reunion, empresas(empresa)").eq("estado", "REUNION_AGENDADA").gte("fecha_reunion", inicioDia).lte("fecha_reunion", finDia).order("fecha_reunion"),
    sb.from("empresas").select("place_id", { count: "exact", head: true }).eq("estado_empresa", "NUEVA").or(`puntaje_base.gte.${Number(ctx.config.umbral_revision_base) || 5},consulta_origen.eq.manual`),
  ]);
  const limite = limiteNuevos(ctx, fecha);
  const nNuevos = Math.min(nuevos.count ?? 0, limite);
  const lineasReu = (reus.data ?? [])
    .map((r) => `<li>${esc(horaBolivia24(r.fecha_reunion!))} · ${esc((r.empresas as unknown as { empresa: string } | null)?.empresa ?? "")} · ${esc(r.nombre ?? "")} (${esc(r.modalidad_reunion ?? "")})</li>`)
    .join("");
  const lineasResp = (resp.data ?? [])
    .map((r) => `<li><b>${esc((r.empresas as unknown as { empresa: string } | null)?.empresa ?? r.nombre ?? "")}</b>: «${esc(String(r.ultima_respuesta ?? "").slice(0, 120))}»</li>`)
    .join("");
  let cuerpo = `
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${fila("Seguimientos y respuestas para hoy", pend.count ?? 0)}
      ${fila(`Chats nuevos para hoy (límite ${limite})`, nNuevos)}
      ${fila("Empresas por revisar", revisar.count ?? 0)}
    </table>
    ${lineasReu ? `<h2 style="font-size:16px;margin:20px 0 8px">Reuniones de hoy</h2><ul style="margin:0;padding-left:18px">${lineasReu}</ul>` : ""}
    ${lineasResp ? `<h2 style="font-size:16px;margin:20px 0 8px">Esperan tu respuesta</h2><ul style="margin:0;padding-left:18px">${lineasResp}</ul>` : ""}`;
  if (conReporte) cuerpo += await bloqueReporte(sb, fecha);
  const total = (pend.count ?? 0) + nNuevos;
  const nReus = (reus.data ?? []).length;
  const asunto =
    total === 0 && nReus === 0
      ? "Hoy: sin acciones pendientes"
      : `Hoy: ${total} ${total === 1 ? "acción" : "acciones"}${nReus ? ` y ${nReus} ${nReus === 1 ? "reunión" : "reuniones"}` : ""}`;
  return [asunto, plantillaCorreo("Tu día en captación", cuerpo, { texto: "Abrir la cola", url: `${appUrl}/cola` })];
}

/** Reporte de la semana anterior (lunes a domingo). */
async function bloqueReporte(sb: SB, hoyFecha: string) {
  const d = new Date(`${hoyFecha}T12:00:00Z`);
  const lunes = new Date(d);
  lunes.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  const finSemana = new Date(lunes);
  finSemana.setUTCDate(lunes.getUTCDate() + 7);
  const desde = `${lunes.toISOString().slice(0, 10)}T00:00:00-04:00`;
  const hasta = `${finSemana.toISOString().slice(0, 10)}T00:00:00-04:00`;
  const { data } = await sb.from("eventos").select("estado_nuevo, primer_contacto").gte("fecha", desde).lt("fecha", hasta);
  const ev = data ?? [];
  const n = (f: (e: { estado_nuevo: string; primer_contacto: boolean }) => boolean) => ev.filter(f).length;
  const contactadas = n((e) => e.primer_contacto);
  const pct = (a: number) => (contactadas ? `${Math.round((100 * a) / contactadas)} %` : "–");
  const resp = n((e) => e.estado_nuevo === "RESPONDIO");
  const ger = n((e) => e.estado_nuevo === "GERENTE_CONSEGUIDO");
  const reu = n((e) => e.estado_nuevo === "REUNION_AGENDADA");
  return `
    <h2 style="font-size:16px;margin:24px 0 8px">Semana pasada</h2>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${fila("Empresas contactadas", contactadas)}
      ${fila("Respuestas", `${resp} (${pct(resp)})`)}
      ${fila("Gerentes conseguidos", `${ger} (${pct(ger)})`)}
      ${fila("Reuniones agendadas", reu)}
      ${fila("Pidieron no contactar", n((e) => e.estado_nuevo === "NO_CONTACTAR"))}
    </table>`;
}
