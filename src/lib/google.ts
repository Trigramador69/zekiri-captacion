import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Google Calendar (eventos con Meet) con la cuenta de Google que conecta cada usuario.
 * El refresh token se guarda cifrado (AES-256-GCM) con TOKEN_CIFRADO_CLAVE; nunca sale del servidor.
 */

export const ALCANCES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export function googleConfigurado() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.TOKEN_CIFRADO_CLAVE);
}

function clave() {
  const k = Buffer.from(process.env.TOKEN_CIFRADO_CLAVE ?? "", "base64");
  if (k.length !== 32) throw new Error("TOKEN_CIFRADO_CLAVE debe ser de 32 bytes en base64.");
  return k;
}

export function cifrar(texto: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64")).join(".");
}

export function descifrar(paquete: string) {
  const [iv, tag, datos] = paquete.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", clave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
}

export function urlAutorizacion(origen: string, estado: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origen}/api/google/callback`,
    response_type: "code",
    scope: ALCANCES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function canjearCodigo(origen: string, code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origen}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error_description?: string; error?: string };
  if (!res.ok || !j.refresh_token) throw new Error(j.error_description || j.error || "Google no devolvió el permiso permanente (refresh token).");
  const payload = j.id_token ? JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString("utf8")) : {};
  return { refresh: j.refresh_token, email: String(payload.email ?? ""), scopes: j.scope ?? "" };
}

export async function revocar(refresh: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => undefined);
}

const cache = new Map<string, { token: string; vence: number }>();

/** Token de acceso del usuario (se renueva solo). `sb` puede ser el cliente del usuario o el de servidor. */
export async function tokenDe(sb: SupabaseClient, userId: string) {
  const c = cache.get(userId);
  if (c && c.vence > Date.now() + 60_000) return c.token;
  const { data } = await sb.from("google_conexiones").select("refresh_token_cifrado").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: descifrar(data.refresh_token_cifrado),
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Google: ${j.error_description || j.error || res.statusText}. Vuelve a conectar tu cuenta en Configuración → Integraciones.`);
  cache.set(userId, { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

async function google<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
  if (res.status === 204) return {} as T;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google respondió ${res.status}: ${(j as { error?: { message?: string } }).error?.message ?? res.statusText}`);
  return j as T;
}

export type EventoReunion = {
  titulo: string;
  descripcion: string;
  inicio: string; // ISO con zona
  minutos?: number;
  modalidad: string | null;
  invitado?: string | null;
  lugar?: string | null;
};

type EventoGoogle = { id: string; htmlLink: string; hangoutLink?: string; conferenceData?: { createRequest?: { status?: { statusCode?: string } } } };

function cuerpoEvento(e: EventoReunion, conMeet: boolean) {
  const inicio = new Date(e.inicio);
  const fin = new Date(inicio.getTime() + (e.minutos ?? 60) * 60000);
  return {
    summary: e.titulo,
    description: e.descripcion,
    start: { dateTime: inicio.toISOString(), timeZone: "America/La_Paz" },
    end: { dateTime: fin.toISOString(), timeZone: "America/La_Paz" },
    ...(e.lugar ? { location: e.lugar } : {}),
    attendees: e.invitado && e.invitado.includes("@") ? [{ email: e.invitado }] : [],
    ...(conMeet ? { conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
}

/** Crea el evento en el calendario principal; si es por Meet, Google genera el enlace. */
export async function crearEvento(token: string, e: EventoReunion) {
  const conMeet = e.modalidad === "Meet";
  const avisar = e.invitado ? "all" : "none";
  let ev = await google<EventoGoogle>(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=${avisar}`,
    { method: "POST", body: JSON.stringify(cuerpoEvento(e, conMeet)) }
  );
  // El Meet a veces queda "pendiente" unos segundos.
  for (let i = 0; conMeet && !ev.hangoutLink && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    ev = await google<EventoGoogle>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.id}`);
  }
  return { id: ev.id, url: ev.htmlLink, meet: ev.hangoutLink ?? null };
}

/** Mueve el evento (reprogramación) y avisa al invitado. */
export async function actualizarEvento(token: string, id: string, e: EventoReunion) {
  const conMeet = e.modalidad === "Meet";
  const actual = await google<EventoGoogle>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`);
  const cuerpo = cuerpoEvento(e, conMeet && !actual.hangoutLink);
  const ev = await google<EventoGoogle>(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}?conferenceDataVersion=1&sendUpdates=${e.invitado ? "all" : "none"}`,
    { method: "PATCH", body: JSON.stringify(cuerpo) }
  );
  return { id: ev.id, url: ev.htmlLink, meet: ev.hangoutLink ?? actual.hangoutLink ?? null };
}

export async function cancelarEvento(token: string, id: string, avisarInvitado = true) {
  await google(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}?sendUpdates=${avisarInvitado ? "all" : "none"}`, { method: "DELETE" });
}
