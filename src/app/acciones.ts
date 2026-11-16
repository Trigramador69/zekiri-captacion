"use server";

import { revalidatePath } from "next/cache";
import { crearClienteAdmin, crearClienteServidor } from "@/lib/supabase/server";
import {
  aplicarEvento,
  cargarContexto,
  crearContacto,
  crearContactoRecepcion,
  eventoDeEnvio,
  renderMensaje,
  CAP,
} from "@/lib/motor";
import { ejecutarConsulta } from "@/lib/places";
import { esVirtual, fechaBolivia, horaAviso, horaBolivia24, telLegible, varsReunion } from "@/lib/mensajes";
import { actualizarEvento, cancelarEvento, crearEvento, descifrar, googleConfigurado, revocar, tokenDe, type EventoReunion } from "@/lib/google";
import { ejecutarTareas } from "@/lib/tareas";
import { headers } from "next/headers";
import { OBJECIONES } from "@/lib/constantes";
import type { Contexto } from "@/lib/tipos";
import type { Contacto, Empresa } from "@/lib/tipos";

export type Resultado = { ok: boolean; mensaje?: string; error?: string; avisos?: string[]; id?: string; datos?: Record<string, string | null> };

async function sesion() {
  const sb = await crearClienteServidor();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) throw new Error("La sesión expiró. Vuelve a entrar.");
  const { data: perfil } = await sb.from("perfiles").select("nombre, rol").eq("id", claims.sub).maybeSingle();
  if (!perfil) throw new Error("Tu usuario no tiene acceso a este sistema.");
  return { sb, usuario: perfil.nombre || (claims.email as string) || "usuario", rol: perfil.rol as string, userId: claims.sub };
}

/** Normaliza a +591…; si el canal es WhatsApp, exige un celular válido. */
function telefonoValido(raw: string | undefined, ciudad: string | null | undefined, canal: string) {
  if (!raw?.trim()) {
    if (canal === "WhatsApp") throw new Error("Falta el celular para escribir por WhatsApp.");
    return null;
  }
  const t = CAP.normalizarTelefono(raw, ciudad) as { e164: string; tipo: string };
  if (!t.e164) throw new Error(`El número «${raw}» no parece un teléfono de Bolivia.`);
  if (canal === "WhatsApp" && t.tipo !== "celular") throw new Error(`«${raw}» es un fijo: WhatsApp necesita un celular (8 dígitos, empieza con 6 o 7).`);
  return t.e164;
}

function refrescar() {
  for (const p of ["/", "/cola", "/conversaciones", "/revisar", "/empresas", "/pipeline", "/reuniones", "/metricas"]) revalidatePath(p);
  revalidatePath("/empresas/[placeId]", "page");
}

async function envolver(fn: () => Promise<Resultado | void>): Promise<Resultado> {
  try {
    const r = await fn();
    refrescar();
    return r ?? { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ───────── Cola ─────────

type SBc = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * Crea o mueve el evento de la reunión en el Google Calendar del usuario (con Meet si corresponde)
 * y guarda el enlace. Si Google no está conectado o falla, la reunión igual queda agendada.
 */
async function sincronizarCalendario(sb: SBc, userId: string, contactoId: string): Promise<{ url?: string; meet?: string | null; nuevo?: boolean; aviso?: string }> {
  if (!googleConfigurado()) return {};
  let token: string | null;
  try {
    token = await tokenDe(sb, userId);
  } catch (e) {
    return { aviso: e instanceof Error ? e.message : String(e) };
  }
  if (!token) return {};
  const { data: c } = await sb.from("contactos").select("*, empresas(*)").eq("contacto_id", contactoId).single();
  if (!c?.fecha_reunion) return {};
  const emp = c.empresas as Empresa | null;
  const evento: EventoReunion = {
    titulo: `Zékiri × ${emp?.empresa ?? c.nombre ?? "reunión"}`,
    descripcion: [
      `Reunión de diagnóstico con ${c.nombre ?? "gerencia"}${c.cargo ? ` (${c.cargo})` : ""}${emp ? ` de ${emp.empresa}` : ""}.`,
      c.telefono_e164 ? `Teléfono: ${telLegible(c.telefono_e164)}` : "",
      c.persona_derivo ? `Nos derivó: ${c.persona_derivo}` : "",
      emp?.dato_personalizacion ? `Dato: ${emp.dato_personalizacion}` : "",
      `Responsable Zékiri: ${c.responsable_reunion ?? "-"}`,
    ]
      .filter(Boolean)
      .join("\n"),
    inicio: c.fecha_reunion,
    modalidad: c.modalidad_reunion,
    invitado: c.correo,
    lugar: c.modalidad_reunion === "presencial" ? emp?.direccion ?? null : c.modalidad_reunion === "Zoom" ? c.enlace_reunion : null,
  };
  try {
    const r = c.evento_google_id ? await actualizarEvento(token, c.evento_google_id, evento) : await crearEvento(token, evento);
    const enlace = c.modalidad_reunion === "Meet" ? r.meet ?? c.enlace_reunion : c.enlace_reunion;
    await sb.from("contactos").update({ evento_google_id: r.id, evento_google_url: r.url, enlace_reunion: enlace }).eq("contacto_id", contactoId);
    return { url: r.url, meet: enlace, nuevo: !c.evento_google_id };
  } catch (e) {
    return { aviso: `No se pudo crear el evento en Google Calendar: ${e instanceof Error ? e.message : e}` };
  }
}

/**
 * Pasos de una reunión agendada: recordatorio el día hábil anterior → el mismo día, 1 h antes,
 * el enlace (Meet/Zoom) o la confirmación → al día hábil siguiente, registrar el resultado.
 */
async function avanzarReunion(sb: SBc, c: Contacto, empresa: Empresa | null, ctx: Contexto, paso: "agendada" | "recordatorio" | "dia") {
  if (!c.fecha_reunion) return;
  const h = CAP.hoyBolivia();
  const fr = fechaBolivia(c.fecha_reunion);
  const virtual = esVirtual(c.modalidad_reunion);
  const hora = horaBolivia24(c.fecha_reunion);
  const delDia: Partial<Contacto> = {
    plantilla_siguiente: virtual ? "REU_ENLACE" : "REU_HOY",
    fecha_proxima: fr,
    proxima_accion: `Reunión hoy a las ${hora}: enviar ${virtual ? "el enlace" : "la confirmación"} a las ${horaAviso(c.fecha_reunion)}`,
  };
  let cambios: Partial<Contacto>;
  if (paso === "agendada") {
    if (fr <= h) cambios = delDia;
    else {
      const ant = CAP.diaHabilAnterior(fr, ctx.feriados, empresa?.ciudad ?? null);
      cambios = {
        plantilla_siguiente: "REU_RECORDATORIO",
        fecha_proxima: ant < h ? h : ant,
        proxima_accion: `Enviar recordatorio (reunión el ${varsReunion(c).dia} a las ${hora})`,
      };
    }
  } else if (paso === "recordatorio") {
    cambios = delDia;
  } else {
    cambios = {
      plantilla_siguiente: null,
      fecha_proxima: CAP.sumarDiasHabiles(fr, 1, ctx.feriados, empresa?.ciudad ?? null),
      proxima_accion: "Registrar el resultado de la reunión",
    };
  }
  cambios.mensaje_siguiente = renderMensaje(cambios.plantilla_siguiente, ctx, empresa, { ...c, ...cambios }).texto || null;
  await sb.from("contactos").update(cambios).eq("contacto_id", c.contacto_id);
}

export async function registrarEnvio(contactoId: string, textoEnviado?: string) {
  return envolver(async () => {
    const { sb, usuario } = await sesion();
    const { data: c } = await sb.from("contactos").select("*").eq("contacto_id", contactoId).single();
    if (!c) throw new Error("Contacto no encontrado");
    const ev = eventoDeEnvio(c as Contacto);
    if (!ev) {
      // Mensaje sin cambio de fase (respuesta libre, pasos de la reunión…): se registra y se programa lo siguiente.
      const h = CAP.hoyBolivia();
      const tocaba = !c.fecha_proxima || c.fecha_proxima <= h;
      if (c.estado === "REUNION_AGENDADA" && c.fecha_reunion) {
        const ctx = await cargarContexto(sb);
        const { data: emp } = await sb.from("empresas").select("*").eq("place_id", c.place_id).maybeSingle();
        if (tocaba && c.plantilla_siguiente === "REU_RECORDATORIO") await avanzarReunion(sb, c as Contacto, emp as Empresa, ctx, "recordatorio");
        else if (tocaba && ["REU_ENLACE", "REU_HOY"].includes(c.plantilla_siguiente ?? "")) await avanzarReunion(sb, c as Contacto, emp as Empresa, ctx, "dia");
        else {
          // Mensaje extra (por ejemplo la confirmación): no cambia el calendario y vuelve el mensaje programado.
          const t = renderMensaje(c.plantilla_siguiente, ctx, emp as Empresa, c as Contacto).texto || null;
          await sb.from("contactos").update({ mensaje_siguiente: t }).eq("contacto_id", contactoId);
        }
      } else {
        await sb
          .from("contactos")
          .update({ plantilla_siguiente: null, mensaje_siguiente: null, proxima_accion: "Esperar respuesta", fecha_proxima: null })
          .eq("contacto_id", contactoId);
      }
      await sb.from("eventos").insert({
        contacto_id: contactoId,
        place_id: c.place_id,
        estado_anterior: c.estado,
        estado_nuevo: "MENSAJE_ENVIADO",
        canal: c.canal,
        variante: c.variante_mensaje,
        registrado_por: usuario,
        nota: (c.plantilla_siguiente ? `${c.plantilla_siguiente}: ` : "") + (textoEnviado ?? "").slice(0, 200),
      });
      return { ok: true, mensaje: "Mensaje registrado" };
    }
    const r = await aplicarEvento(sb, contactoId, ev, { usuario, nota: c.plantilla_siguiente ?? undefined });
    return { ok: true, mensaje: "Envío registrado", avisos: r.avisos };
  });
}

export async function cambiarVariante(contactoId: string, variante: "A" | "B") {
  return envolver(async () => {
    const { sb } = await sesion();
    const ctx = await cargarContexto(sb);
    const { data: c } = await sb.from("contactos").select("*, empresas(*)").eq("contacto_id", contactoId).single();
    if (!c || c.estado !== "LISTO") throw new Error("Solo se cambia la variante antes del primer envío.");
    const nuevo = { ...c, variante_mensaje: variante };
    const p = CAP.elegirPrimeraPlantilla(nuevo) as { plantilla: string; accion: string };
    const texto = renderMensaje(p.plantilla, ctx, c.empresas as Empresa, nuevo).texto;
    await sb.from("contactos").update({ variante_mensaje: variante, plantilla_siguiente: p.plantilla, proxima_accion: p.accion, mensaje_siguiente: texto }).eq("contacto_id", contactoId);
  });
}

export async function guardarMensaje(contactoId: string, texto: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    await sb.from("contactos").update({ mensaje_siguiente: texto }).eq("contacto_id", contactoId);
  });
}

export async function usarPlantilla(contactoId: string, plantilla: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    const ctx = await cargarContexto(sb);
    const { data: c } = await sb.from("contactos").select("*, empresas(*)").eq("contacto_id", contactoId).single();
    if (!c) throw new Error("Contacto no encontrado");
    const r = renderMensaje(plantilla, ctx, c.empresas as Empresa, c);
    await sb.from("contactos").update({ mensaje_siguiente: r.texto }).eq("contacto_id", contactoId);
    return { ok: true, mensaje: r.faltantes.length ? `Faltan datos: ${r.faltantes.join(", ")}` : undefined };
  });
}

export async function registrarRespuesta(contactoId: string, texto: string, objecion?: string) {
  return envolver(async () => {
    const { sb, usuario } = await sesion();
    // Si el estado no cambia (p. ej. ya estaba en RESPONDIO), igual vuelve a la cola de hoy para contestar.
    const extra = { ultima_respuesta: texto, fecha_proxima: CAP.hoyBolivia(), proxima_accion: "Responder hoy", ...(objecion ? { objecion } : {}) };
    const r = await aplicarEvento(sb, contactoId, { tipo: "respuesta", texto }, { usuario, extra, nota: texto.slice(0, 280) });
    // Si eligió una objeción con plantilla, el siguiente mensaje es la respuesta a esa objeción (no el paso normal del embudo).
    const obj = objecion ? OBJECIONES[objecion] : undefined;
    if (obj?.plantilla && r.estado !== "NO_CONTACTAR") {
      const ctx = await cargarContexto(sb);
      const { data: c } = await sb.from("contactos").select("*, empresas(*)").eq("contacto_id", contactoId).single();
      if (c) {
        const m = renderMensaje(obj.plantilla, ctx, c.empresas as Empresa, c);
        await sb.from("contactos").update({ mensaje_siguiente: m.texto, proxima_accion: `Responder: ${obj.etiqueta.toLowerCase()}` }).eq("contacto_id", contactoId);
      }
    }
    return { ok: true, mensaje: r.estado === "NO_CONTACTAR" ? "Pidió no recibir mensajes: pasó a No contactar" : "Respuesta registrada", avisos: r.avisos };
  });
}

export async function cambiarEstado(contactoId: string, estado: string, nota?: string) {
  return envolver(async () => {
    const { sb, usuario, userId } = await sesion();
    // Si se cae una reunión futura, se cancela el evento en Google Calendar (y se avisa al invitado).
    if (["DESCARTADO", "PERDIDO", "NO_CONTACTAR"].includes(estado)) {
      const { data: c } = await sb.from("contactos").select("estado, fecha_reunion, evento_google_id").eq("contacto_id", contactoId).single();
      if (c?.estado === "REUNION_AGENDADA" && c.evento_google_id && c.fecha_reunion && new Date(c.fecha_reunion) > new Date()) {
        try {
          const token = await tokenDe(sb, userId);
          if (token) await cancelarEvento(token, c.evento_google_id);
          await sb.from("contactos").update({ evento_google_id: null, evento_google_url: null }).eq("contacto_id", contactoId);
        } catch {
          /* si falla, el evento queda en el calendario; no bloquea el cambio de estado */
        }
      }
    }
    const r = await aplicarEvento(sb, contactoId, { tipo: "cambio_estado", estado }, { usuario, nota });
    return { ok: true, avisos: r.avisos };
  });
}

export async function gerenteConseguido(
  contactoId: string,
  datos: { nombre: string; cargo?: string; telefono?: string; correo?: string; canal: string; nombreRecepcion?: string; enviarHoy?: boolean }
) {
  return envolver(async () => {
    const { sb, usuario } = await sesion();
    const ctx = await cargarContexto(sb);
    const { data: c } = await sb.from("contactos").select("*, empresas(*)").eq("contacto_id", contactoId).single();
    if (!c) throw new Error("Contacto no encontrado");
    if (datos.nombreRecepcion) await sb.from("contactos").update({ nombre: datos.nombreRecepcion }).eq("contacto_id", contactoId);
    await aplicarEvento(sb, contactoId, { tipo: "cambio_estado", estado: "GERENTE_CONSEGUIDO" }, { usuario, ctx, nota: `Gerente: ${datos.nombre}` });
    const tel = telefonoValido(datos.telefono, (c.empresas as Empresa)?.ciudad, datos.canal);
    const nuevoId = await crearContacto(
      sb,
      {
        place_id: c.place_id,
        rol_contacto: "gerente",
        origen_contacto: "derivado_recepcion",
        persona_derivo: datos.nombreRecepcion || c.nombre || null,
        nombre: datos.nombre,
        cargo: datos.cargo || null,
        canal: datos.canal,
        telefono_e164: tel,
        correo: datos.correo || null,
      },
      c.empresas as Empresa,
      ctx,
      usuario
    );
    return { ok: true, mensaje: `Gerente agregado (${nuevoId}). Ya está en la cola de hoy.`, id: nuevoId };
  });
}

export async function agendarReunion(contactoId: string, datos: { fecha: string; hora: string; modalidad: string; responsable: string; enlace?: string }) {
  return envolver(async () => {
    const { sb, usuario, userId } = await sesion();
    const ctx = await cargarContexto(sb);
    const enlace = datos.enlace?.trim() || null;
    if (enlace && !/^https?:\/\//i.test(enlace)) throw new Error("El enlace debe empezar con https://");
    const fechaReunion = `${datos.fecha} ${datos.hora}:00-04`;
    const nota = `${datos.fecha} ${datos.hora} · ${datos.modalidad}`;
    const extra = { fecha_reunion: fechaReunion, modalidad_reunion: datos.modalidad, responsable_reunion: datos.responsable, enlace_reunion: enlace };
    const { data: previo } = await sb.from("contactos").select("estado").eq("contacto_id", contactoId).single();
    const reprograma = previo?.estado === "REUNION_AGENDADA";
    let avisos: string[] = [];
    if (reprograma) {
      // Reprogramación: no es un paso nuevo del embudo, solo queda en el historial.
      const { data: c0 } = await sb.from("contactos").update(extra).eq("contacto_id", contactoId).select("place_id").single();
      await sb.from("eventos").insert({ contacto_id: contactoId, place_id: c0?.place_id, estado_anterior: "REUNION_AGENDADA", estado_nuevo: "REUNION_REPROGRAMADA", registrado_por: usuario, nota });
    } else {
      const r = await aplicarEvento(sb, contactoId, { tipo: "cambio_estado", estado: "REUNION_AGENDADA" }, { usuario, ctx, extra, nota });
      avisos = r.avisos.filter((a) => !a.includes("fecha_reunion"));
    }
    const cal = await sincronizarCalendario(sb, userId, contactoId);
    if (cal.aviso) avisos.push(cal.aviso);
    const { data: c } = await sb.from("contactos").select("*, empresas(*)").eq("contacto_id", contactoId).single();
    if (c) await avanzarReunion(sb, c as Contacto, c.empresas as Empresa, ctx, "agendada");
    return {
      ok: true,
      mensaje: reprograma ? "Reunión reprogramada" : "Reunión agendada 🎉",
      avisos,
      datos: { calendario_url: cal.url ?? null, evento_nuevo: cal.nuevo ? "si" : null, enlace: cal.meet ?? c?.enlace_reunion ?? null },
    };
  });
}

export async function guardarEnlaceReunion(contactoId: string, enlace: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    const limpio = enlace.trim();
    if (limpio && !/^https?:\/\//i.test(limpio)) throw new Error("El enlace debe empezar con https://");
    const ctx = await cargarContexto(sb);
    const { data: c } = await sb.from("contactos").select("*, empresas(*)").eq("contacto_id", contactoId).single();
    if (!c) throw new Error("Contacto no encontrado");
    const cambios: Partial<Contacto> = { enlace_reunion: limpio || null };
    if (["REU_ENLACE", "REU_HOY", "REU_RECORDATORIO"].includes(c.plantilla_siguiente ?? "")) {
      cambios.mensaje_siguiente = renderMensaje(c.plantilla_siguiente, ctx, c.empresas as Empresa, { ...c, ...cambios }).texto || null;
    }
    await sb.from("contactos").update(cambios).eq("contacto_id", contactoId);
    return { ok: true, mensaje: limpio ? "Enlace guardado" : "Enlace quitado" };
  });
}

export async function registrarResultadoReunion(contactoId: string, estado: string, resultado: string) {
  return envolver(async () => {
    const { sb, usuario } = await sesion();
    await aplicarEvento(sb, contactoId, { tipo: "cambio_estado", estado }, { usuario, extra: { resultado }, nota: resultado });
  });
}

export async function registrarMaterial(contactoId: string, materialId: string, titulo: string) {
  return envolver(async () => {
    const { sb, usuario } = await sesion();
    const { data: c } = await sb.from("contactos").select("place_id, estado, canal, variante_mensaje").eq("contacto_id", contactoId).single();
    if (!c) throw new Error("Contacto no encontrado");
    await sb.from("eventos").insert({
      contacto_id: contactoId,
      place_id: c.place_id,
      estado_anterior: c.estado,
      estado_nuevo: "MATERIAL_ENVIADO",
      canal: c.canal,
      variante: c.variante_mensaje,
      registrado_por: usuario,
      nota: titulo,
      material_id: materialId,
    });
  });
}

export async function guardarNotaContacto(contactoId: string, notas: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    await sb.from("contactos").update({ notas }).eq("contacto_id", contactoId);
  });
}

// ───────── Revisión de empresas ─────────

export async function revisarEmpresa(
  placeId: string,
  datos: { puntaje_revision: number; dato_personalizacion?: string; linkedin_empresa?: string; empleados_li?: string; notas?: string }
) {
  return envolver(async () => {
    const { sb, usuario, userId } = await sesion();
    const ctx = await cargarContexto(sb);
    const { data: e, error } = await sb
      .from("empresas")
      .update({
        puntaje_revision: datos.puntaje_revision,
        dato_personalizacion: datos.dato_personalizacion || null,
        linkedin_empresa: datos.linkedin_empresa || null,
        empleados_li: datos.empleados_li || null,
        notas: datos.notas || null,
        estado_empresa: "LISTA",
        verificado_por: userId,
        fecha_verificacion: new Date().toISOString(),
      })
      .eq("place_id", placeId)
      .select("*")
      .single();
    if (error || !e) throw new Error(error?.message ?? "Empresa no encontrada");
    const id = await crearContactoRecepcion(sb, e as Empresa, ctx, usuario);
    return { ok: true, mensaje: `${(e as Empresa).empresa} lista para contactar (${id})` };
  });
}

export async function descartarEmpresa(placeId: string, motivo: string) {
  return envolver(async () => {
    const { sb, userId } = await sesion();
    await sb.from("empresas").update({ estado_empresa: "DESCARTADA", motivo_descarte: motivo, verificado_por: userId, fecha_verificacion: new Date().toISOString() }).eq("place_id", placeId);
  });
}

/** Deshace una aprobación hecha por error: borra el contacto todavía sin enviar y la empresa vuelve a Revisar. */
export async function deshacerAprobacion(placeId: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    const { data: cs } = await sb.from("contactos").select("contacto_id, estado").eq("place_id", placeId);
    if ((cs ?? []).some((c) => c.estado !== "LISTO")) throw new Error("Ya se le escribió: no se puede deshacer. Usa Descartar.");
    const ids = (cs ?? []).map((c) => c.contacto_id);
    if (ids.length) {
      await sb.from("eventos").delete().in("contacto_id", ids);
      await sb.from("contactos").delete().in("contacto_id", ids);
    }
    await sb.from("empresas").update({ estado_empresa: "NUEVA", puntaje_revision: null, verificado_por: null, fecha_verificacion: null }).eq("place_id", placeId);
    return { ok: true, mensaje: "Aprobación deshecha" };
  });
}

export async function restaurarEmpresa(placeId: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    await sb.from("empresas").update({ estado_empresa: "NUEVA", motivo_descarte: null }).eq("place_id", placeId).eq("estado_empresa", "DESCARTADA");
  });
}

export async function guardarEmpresa(placeId: string, datos: { dato_personalizacion?: string; notas?: string; linkedin_empresa?: string }) {
  return envolver(async () => {
    const { sb } = await sesion();
    const { error } = await sb.from("empresas").update(datos).eq("place_id", placeId);
    if (error) throw new Error(error.message);
    return { ok: true, mensaje: "Guardado" };
  });
}

export async function agregarContacto(
  placeId: string,
  datos: { nombre: string; cargo?: string; rol_contacto: string; origen_contacto: string; canal: string; telefono?: string; correo?: string; linkedin_url?: string }
) {
  return envolver(async () => {
    const { sb, usuario } = await sesion();
    const ctx = await cargarContexto(sb);
    const { data: e } = await sb.from("empresas").select("*").eq("place_id", placeId).single();
    if (!e) throw new Error("Empresa no encontrada");
    const tel = telefonoValido(datos.telefono, e.ciudad, datos.canal);
    const id = await crearContacto(
      sb,
      {
        place_id: placeId,
        rol_contacto: datos.rol_contacto,
        origen_contacto: datos.origen_contacto,
        nombre: datos.nombre,
        cargo: datos.cargo || null,
        canal: datos.canal,
        telefono_e164: tel,
        correo: datos.correo || null,
        linkedin_url: datos.linkedin_url || null,
      },
      e as Empresa,
      ctx,
      usuario
    );
    if (["NUEVA", "EN_REVISION", "DESCARTADA"].includes(e.estado_empresa)) await sb.from("empresas").update({ estado_empresa: "LISTA" }).eq("place_id", placeId);
    return { ok: true, mensaje: `Contacto agregado (${id}). Está en la cola de hoy.` };
  });
}

export async function crearEmpresaManual(datos: { empresa: string; ciudad: string; sector: string; telefono?: string; web?: string; notas?: string }) {
  return envolver(async () => {
    const { sb } = await sesion();
    const { data: manuales } = await sb.from("empresas").select("place_id").like("place_id", "MAN-%");
    const max = Math.max(0, ...(manuales ?? []).map((m) => Number(m.place_id.slice(4)) || 0));
    const placeId = `MAN-${String(max + 1).padStart(4, "0")}`;
    const t = CAP.normalizarTelefono(datos.telefono ?? "", datos.ciudad) as { e164: string; tipo: string };
    const telTipo = t.e164 ? (t.tipo === "otro" ? "fijo" : t.tipo) : "sin_telefono";
    const pb = CAP.puntajeBase({ resenas: 0, web: datos.web, sector: datos.sector, telTipo, sucursales: 1 }) as { puntaje: number; detalle: string[] };
    const { error } = await sb.from("empresas").insert({
      place_id: placeId,
      empresa: datos.empresa,
      ciudad: datos.ciudad,
      sector: datos.sector,
      consulta_origen: "manual",
      tel_publico: t.e164 || datos.telefono || null,
      tel_tipo: telTipo,
      web: datos.web || null,
      puntaje_base: pb.puntaje,
      puntaje_detalle: pb.detalle.join(" · ") || "sin señales",
      canal_inicial: CAP.canalInicial(telTipo),
      notas: datos.notas || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, mensaje: `Empresa agregada (${placeId})`, id: placeId };
  });
}

// ───────── Búsquedas en Google Places ─────────

export async function correrConsulta(id: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    const { data: c } = await sb.from("consultas").select("*").eq("id", id).single();
    if (!c) throw new Error("Búsqueda no encontrada");
    const r = await ejecutarConsulta(sb, c);
    return {
      ok: true,
      mensaje: `${r.encontradas} resultados, ${r.nuevas} empresas nuevas, ${r.paraRevisar} para revisar (${r.solicitudes} solicitudes a Google)${
        r.sitiosLeidos ? `. Se leyeron ${r.sitiosLeidos} sitios web: ${r.conWhatsapp} con WhatsApp` : ""
      }${r.quedabanMas ? ". Quedaban más: divide la búsqueda por zona" : ""}`,
    };
  });
}

export async function guardarConsulta(datos: { id?: string; ciudad: string; zona?: string; sector: string; termino: string }) {
  return envolver(async () => {
    const { sb } = await sesion();
    let id = datos.id;
    if (!id) {
      const { data } = await sb.from("consultas").select("id").order("id", { ascending: false }).limit(1);
      const n = Number(String(data?.[0]?.id ?? "Q000").slice(1)) + 1;
      id = `Q${String(n).padStart(3, "0")}`;
    }
    await sb.from("consultas").upsert({ id, ciudad: datos.ciudad, zona: datos.zona || null, sector: datos.sector, termino: datos.termino, activa: true });
  });
}

// ───────── Configuración ─────────

export async function guardarConfig(valores: Record<string, string>) {
  return envolver(async () => {
    const { sb } = await sesion();
    const filas = Object.entries(valores).map(([clave, valor]) => ({ clave, valor }));
    const { error } = await sb.from("config").upsert(filas, { onConflict: "clave", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
    return { ok: true, mensaje: "Configuración guardada" };
  });
}

export async function guardarPlantilla(id: string, texto: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    await sb.from("plantillas").update({ texto, actualizado: new Date().toISOString() }).eq("id", id);
    return { ok: true, mensaje: "Plantilla guardada" };
  });
}

export async function agregarExclusion(datos: { telefono?: string; correo?: string; motivo: string }) {
  return envolver(async () => {
    const { sb } = await sesion();
    const tel = datos.telefono ? ((CAP.normalizarTelefono(datos.telefono).e164 as string) || datos.telefono) : null;
    await sb.from("exclusion").insert({ telefono_e164: tel, correo: datos.correo || null, motivo: datos.motivo });
  });
}

// ───────── Materiales ─────────

export async function crearMaterial(datos: { titulo: string; descripcion?: string; sector?: string; tipo: string; archivo?: string; url: string; peso_bytes?: number }) {
  return envolver(async () => {
    const { sb } = await sesion();
    const { error } = await sb.from("materiales").insert(datos);
    if (error) throw new Error(error.message);
    return { ok: true, mensaje: "Material agregado" };
  });
}

export async function eliminarMaterial(id: string) {
  return envolver(async () => {
    const { sb } = await sesion();
    const { data: m } = await sb.from("materiales").select("archivo").eq("id", id).single();
    if (m?.archivo) await sb.storage.from("materiales").remove([m.archivo]);
    await sb.from("materiales").delete().eq("id", id);
  });
}

export async function salir() {
  const sb = await crearClienteServidor();
  await sb.auth.signOut();
}

// ───────── Buscador global ─────────

export type ResultadoBusqueda = {
  contactos: { contacto_id: string; nombre: string | null; empresa: string | null; estado: string; telefono_e164: string | null; rol_contacto: string }[];
  empresas: { place_id: string; empresa: string; ciudad: string | null; estado_empresa: string }[];
};

export async function buscar(texto: string): Promise<ResultadoBusqueda> {
  const vacio = { contactos: [], empresas: [] };
  const q = texto.trim().replace(/[%,()*]/g, " ").trim();
  if (q.length < 2) return vacio;
  try {
    const { sb } = await sesion();
    const dig = q.replace(/\D/g, "");
    const porTel = dig.length >= 4;
    const [ce, cn, em] = await Promise.all([
      // contactos cuya empresa coincide
      sb.from("empresas").select("place_id").ilike("empresa", `%${q}%`).limit(30),
      sb
        .from("contactos")
        .select("contacto_id, nombre, estado, telefono_e164, rol_contacto, place_id, empresas(empresa)")
        .or(porTel ? `telefono_e164.ilike.%${dig}%,nombre.ilike.%${q}%` : `nombre.ilike.%${q}%`)
        .limit(15),
      sb
        .from("empresas")
        .select("place_id, empresa, ciudad, estado_empresa")
        .or(porTel ? `empresa.ilike.%${q}%,tel_publico.ilike.%${dig}%,whatsapp.ilike.%${dig}%` : `empresa.ilike.%${q}%`)
        .order("estado_empresa")
        .limit(10),
    ]);
    const ids = (ce.data ?? []).map((e) => e.place_id);
    const { data: cDeEmpresas } = ids.length
      ? await sb.from("contactos").select("contacto_id, nombre, estado, telefono_e164, rol_contacto, place_id, empresas(empresa)").in("place_id", ids).limit(15)
      : { data: [] };
    const todos = new Map<string, ResultadoBusqueda["contactos"][number]>();
    for (const c of [...(cn.data ?? []), ...(cDeEmpresas ?? [])]) {
      const emp = c.empresas as unknown as { empresa: string } | null;
      todos.set(c.contacto_id, { contacto_id: c.contacto_id, nombre: c.nombre, empresa: emp?.empresa ?? null, estado: c.estado, telefono_e164: c.telefono_e164, rol_contacto: c.rol_contacto });
    }
    return { contactos: [...todos.values()].slice(0, 12), empresas: em.data ?? [] };
  } catch {
    return vacio;
  }
}

// ───────── Integraciones (Google y tareas programadas) ─────────

export async function desconectarGoogle() {
  return envolver(async () => {
    const { sb, userId } = await sesion();
    const { data } = await sb.from("google_conexiones").select("refresh_token_cifrado").eq("user_id", userId).maybeSingle();
    if (data) {
      try {
        await revocar(descifrar(data.refresh_token_cifrado));
      } catch {
        /* si ya no era válido, igual se borra */
      }
      await sb.from("google_conexiones").delete().eq("user_id", userId);
    }
    return { ok: true, mensaje: "Cuenta de Google desconectada" };
  });
}

/** Corre las tareas programadas ahora (botón de prueba). `forzar` permite mandar el resumen aunque ya se haya enviado hoy. */
export async function ejecutarTareasAhora(forzar: string[] = []) {
  return envolver(async () => {
    await sesion();
    const h = await headers();
    const appUrl = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const r = await ejecutarTareas(crearClienteAdmin(), { appUrl, forzar });
    if (r.errores.length) throw new Error(r.errores.join(" · "));
    return { ok: true, mensaje: r.hecho.length ? r.hecho.join(" · ") : "Nada pendiente por ahora" };
  });
}
