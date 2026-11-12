// Utilidades de mensajes que sirven en el servidor y en el navegador.

const SALUDOS = /^(buen[oa]s\s+(d[ií]as|tardes|noches))/i;

function horaBolivia(ahora = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/La_Paz", hour: "2-digit", hourCycle: "h23" }).format(ahora));
}

export function saludoActual(ahora = new Date()) {
  const h = horaBolivia(ahora);
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Cambia el "Buenos días / Buenas tardes" inicial por el que corresponde a la hora de Bolivia. */
export function ajustarSaludo(texto: string, ahora = new Date()) {
  if (!texto) return texto;
  return texto.replace(SALUDOS, saludoActual(ahora));
}

export function waLink(telefono: string | null | undefined, texto?: string) {
  const d = String(telefono ?? "").replace(/\D/g, "");
  if (!d) return "";
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export function mapsLink(placeId: string, nombre: string) {
  if (placeId.startsWith("MAN-")) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nombre)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nombre)}&query_place_id=${encodeURIComponent(placeId)}`;
}

export function telLegible(e164: string | null | undefined) {
  const s = String(e164 ?? "");
  const m = s.match(/^\+591(\d)(\d{3})(\d{4})$/);
  if (m) return `+591 ${m[1]}${m[2]} ${m[3]}`;
  return s;
}

/** Nombre corto para usar dentro de un mensaje: sin sucursal, zona ni razón social. */
export function nombreCorto(n: string) {
  let s = String(n || "").split(/\s+[-–|(]\s*|\s*,\s*/)[0];
  s = s
    .replace(/["“”]/g, "")
    .replace(/(^|\s)(S\.?\s?R\.?\s?L|S\.?\s?A|LTDA)\.?(?=\s|$)/gi, " ")
    .replace(/\s+(Santa Cruz|La Paz|Cochabamba)\s*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/[\s.]+$/, "")
    .trim();
  return s || String(n || "").trim();
}

/** Enlace para crear el evento en Google Calendar (sin API ni permisos). Ahí se agrega el Meet con un clic. */
export function calendarLink({
  titulo,
  inicio,
  minutos = 60,
  detalle = "",
  invitados = [],
  lugar = "",
}: {
  titulo: string;
  inicio: Date;
  minutos?: number;
  detalle?: string;
  invitados?: (string | null | undefined)[];
  lugar?: string;
}) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fin = new Date(inicio.getTime() + minutos * 60000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: titulo, dates: `${f(inicio)}/${f(fin)}`, details: detalle, ctz: "America/La_Paz" });
  const mails = invitados.filter((x): x is string => !!x && x.includes("@"));
  if (mails.length) q.set("add", mails.join(","));
  if (lugar) q.set("location", lugar);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

const TZ = "America/La_Paz";

/** Fecha 'YYYY-MM-DD' en hora de Bolivia de un timestamp. */
export function fechaBolivia(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

export function horaBolivia24(iso: string | Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const MODALIDAD_FRASE: Record<string, string> = { Meet: "por Google Meet", Zoom: "por Zoom", presencial: "en persona", llamada: "por llamada" };

export const esVirtual = (modalidad: string | null | undefined) => modalidad === "Meet" || modalidad === "Zoom";

/** Variables de las plantillas de reunión: {dia} {hora} {modalidad} {enlace}. */
export function varsReunion(c: { fecha_reunion?: string | null; modalidad_reunion?: string | null; enlace_reunion?: string | null }) {
  if (!c.fecha_reunion) return {};
  const d = new Date(c.fecha_reunion);
  return {
    dia: new Intl.DateTimeFormat("es-BO", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d),
    hora: horaBolivia24(d),
    modalidad: MODALIDAD_FRASE[c.modalidad_reunion ?? ""] ?? c.modalidad_reunion ?? "",
    enlace: c.enlace_reunion ?? undefined,
  };
}

/** Hora a la que conviene mandar el enlace (1 hora antes). */
export function horaAviso(iso: string, minutosAntes = 60) {
  return horaBolivia24(new Date(new Date(iso).getTime() - minutosAntes * 60000));
}

export type DatosReunion = {
  contacto_id: string;
  evento_google_url?: string | null;
  nombre: string | null;
  cargo?: string | null;
  correo?: string | null;
  telefono_e164?: string | null;
  fecha_reunion: string | null;
  modalidad_reunion: string | null;
  responsable_reunion: string | null;
  enlace_reunion: string | null;
  empresa?: string | null;
};

export function enlaceCalendario(r: DatosReunion) {
  if (!r.fecha_reunion) return "";
  const detalle = [
    `Reunión de diagnóstico con ${r.empresa ?? ""}`,
    `${r.nombre ?? ""}${r.cargo ? ` (${r.cargo})` : ""}${r.telefono_e164 ? ` · ${telLegible(r.telefono_e164)}` : ""}`,
    r.enlace_reunion ? `Enlace: ${r.enlace_reunion}` : "",
    `Responsable Zékiri: ${r.responsable_reunion ?? "-"}`,
  ]
    .filter(Boolean)
    .join("\n");
  return calendarLink({
    titulo: `Zékiri × ${r.empresa ?? r.nombre ?? "reunión"}`,
    inicio: new Date(r.fecha_reunion),
    detalle,
    invitados: [r.correo],
    lugar: r.enlace_reunion ?? "",
  });
}
