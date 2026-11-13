/*
 * Lee el sitio web de una empresa y saca el WhatsApp, el correo y las redes que publica.
 * Sin dependencias: lo usan la web (al buscar en Places y en las tareas programadas) y el script de carga inicial.
 */

export type DatosSitio = {
  whatsapp: string | null;
  correo: string | null;
  redes: { instagram?: string; facebook?: string; linkedin?: string; tiktok?: string };
  error?: string;
};

const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 1_500_000;
// Sitios que no son de la empresa: no se leen (bloquean o no aportan), pero sí cuentan como red social.
const NO_LEER = ["facebook.com", "instagram.com", "tiktok.com", "linkedin.com", "wa.me", "whatsapp.com", "google.com", "goo.gl", "youtube.com", "x.com", "twitter.com"];
const CORREO_BASURA = /(\.(png|jpe?g|gif|webp|svg)$)|sentry|wixpress|example\.|domain\.|tudominio|correo@|email@|@sitio|@empresa\.com|u00/i;

/** Número de WhatsApp en formato +591XXXXXXXX (solo celulares bolivianos). */
export function whatsappBoliviano(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00591")) d = d.slice(5);
  else if (d.startsWith("591") && d.length === 11) d = d.slice(3);
  return d.length === 8 && /^[67]/.test(d) ? `+591${d}` : null;
}

function host(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function bajar(url: string, ms: number): Promise<{ html: string; final: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { "User-Agent": NAVEGADOR, Accept: "text/html,*/*;q=0.8", "Accept-Language": "es" }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok || !(res.headers.get("content-type") ?? "text/html").includes("html")) return null;
    const lector = res.body?.getReader();
    if (!lector) return { html: await res.text(), final: res.url };
    const partes: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await lector.read();
      if (done || !value) break;
      partes.push(value);
      total += value.length;
    }
    lector.cancel().catch(() => {});
    return { html: new TextDecoder().decode(Buffer.concat(partes)), final: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extraer(html: string, dominio: string, previo: DatosSitio): DatosSitio {
  const r: DatosSitio = { whatsapp: previo.whatsapp, correo: previo.correo, redes: { ...previo.redes } };
  const texto = html.replace(/&amp;/g, "&").replace(/\\\//g, "/");

  if (!r.whatsapp) {
    const wa = texto.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^"'<>\s]*?&)?phone=|whatsapp:\/\/send\/?\?phone=|web\.whatsapp\.com\/send\/?\?phone=)\+?(\d{8,13})/gi) ?? [];
    for (const m of wa) {
      const n = whatsappBoliviano(m.match(/(\d{8,13})$/)?.[1]);
      if (n) {
        r.whatsapp = n;
        break;
      }
    }
  }

  if (!r.correo) {
    const mailto = [...texto.matchAll(/mailto:([^"'?<>\s]+)/gi)].map((m) => decodeURIComponent(m[1]));
    const sueltos = texto.replace(/<[^>]+>/g, " ").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    const candidatos = [...mailto, ...sueltos].map((c) => c.toLowerCase().trim()).filter((c) => c.includes("@") && !CORREO_BASURA.test(c));
    // Primero los del dominio de la empresa.
    r.correo = candidatos.find((c) => dominio && c.endsWith(`@${dominio}`)) ?? candidatos[0] ?? null;
  }

  const red = (k: keyof DatosSitio["redes"], re: RegExp) => {
    if (r.redes[k]) return;
    for (const m of texto.matchAll(re)) {
      const url = m[0].replace(/["'<>\s]+$/, "").replace(/\/$/, "");
      if (!/sharer|share\?|intent|plugins|dialog|\/tr\?|\/p\/|\/reel\/|\/posts?\//i.test(url)) {
        r.redes[k] = url.startsWith("http") ? url : `https://${url}`;
        return;
      }
    }
  };
  red("instagram", /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9_.]{2,30}\/?/g);
  red("facebook", /(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/[A-Za-z0-9_.-]{2,80}\/?/g);
  red("linkedin", /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9_%.-]{2,80}\/?/g);
  red("tiktok", /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]{2,30}\/?/g);
  return r;
}

/** Lee la portada y, si falta el WhatsApp o el correo, una página de contacto del mismo sitio. */
export async function leerSitio(url: string, ms = 8000): Promise<DatosSitio> {
  const vacio: DatosSitio = { whatsapp: null, correo: null, redes: {} };
  const inicio = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const h = host(inicio);
  if (!h) return { ...vacio, error: "dirección inválida" };
  if (NO_LEER.some((d) => h === d || h.endsWith(`.${d}`))) {
    const redes: DatosSitio["redes"] = {};
    if (h.endsWith("instagram.com")) redes.instagram = inicio;
    if (h.endsWith("facebook.com")) redes.facebook = inicio;
    if (h.endsWith("tiktok.com")) redes.tiktok = inicio;
    if (h.endsWith("linkedin.com") && inicio.includes("/company/")) redes.linkedin = inicio;
    const wa = h.endsWith("wa.me") || h.endsWith("whatsapp.com") ? whatsappBoliviano(inicio) : null;
    return { ...vacio, whatsapp: wa, redes };
  }
  const portada = await bajar(inicio, ms);
  if (!portada) return { ...vacio, error: "el sitio no respondió" };
  const dominio = host(portada.final) || h;
  let r = extraer(portada.html, dominio, vacio);
  if (!r.whatsapp || !r.correo) {
    const enlace = [...portada.html.matchAll(/href=["']([^"'#]*contact[^"'#]*)["']/gi)].map((m) => m[1]).find((x) => !/mailto:|wa\.me|whatsapp/i.test(x));
    if (enlace) {
      try {
        const pagina = new URL(enlace, portada.final).toString();
        if (host(pagina) === dominio) {
          const contacto = await bajar(pagina, ms);
          if (contacto) r = extraer(contacto.html, dominio, r);
        }
      } catch {
        /* enlace raro: se ignora */
      }
    }
  }
  return r;
}
