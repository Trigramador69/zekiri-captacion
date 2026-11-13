'use strict';
/**
 * Lógica central del sistema de captación de Zékiri.
 *
 * Sin dependencias externas: la usan los tests (Node), el script de prueba de Places
 * y los nodos Code de n8n (se pega el contenido). Más adelante, el sistema interno.
 *
 * Fechas: siempre como texto 'YYYY-MM-DD' (hora de Bolivia, UTC-4 sin horario de verano).
 */

// ───────────────────────── Constantes ─────────────────────────

const ZONA_HORARIA = 'America/La_Paz';

const CIUDADES = {
  SCZ: { nombre: 'Santa Cruz', codigoArea: '3' },
  LPZ: { nombre: 'La Paz', codigoArea: '2' },
  CBBA: { nombre: 'Cochabamba', codigoArea: '4' },
};

/** Cómo se nombra cada sector dentro de un mensaje ("empresas de ___"). */
const SECTOR_FRASE = {
  'Comercio / importación': 'comercio e importación',
  Salud: 'salud',
  Logística: 'logística',
  Industria: 'la industria',
  'Construcción / inmobiliaria': 'construcción',
  Servicios: 'servicios',
  Educación: 'educación',
  Agro: 'agroindustria',
};

const SECTORES_PRIORITARIOS = ['Comercio / importación', 'Salud', 'Logística', 'Industria', 'Educación', 'Agro', 'Construcción / inmobiliaria'];

const UMBRALES_DEFECTO = { revisionBase: 5, A: 11, B: 7 };

/** Dominios que no cuentan como "sitio web propio". */
const DOMINIOS_NO_PROPIOS = [
  'facebook.com', 'fb.com', 'instagram.com', 'linktr.ee', 'wa.me', 'whatsapp.com', 'tiktok.com',
  'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'google.com', 'sites.google.com',
  'business.site', 'wixsite.com', 'blogspot.com', 'wordpress.com', 'negocio.site', 'goo.gl',
];

// ───────────────────────── Fechas y días hábiles ─────────────────────────

function hoyBolivia(ahora = new Date()) {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(ahora);
}

/** Fecha y hora de Bolivia como 'YYYY-MM-DD HH:mm' (formato que Google Sheets reconoce como fecha). */
function ahoraBolivia(ahora = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(ahora)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Acepta 'YYYY-MM-DD', 'YYYY-MM-DD hh:mm', 'DD/MM/YYYY' o Date. Devuelve 'YYYY-MM-DD' o null. */
function normalizarFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return isNaN(valor) ? null : hoyBolivia(valor);
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function _aDate(s) {
  return new Date(`${s}T00:00:00Z`);
}

function _aTexto(d) {
  return d.toISOString().slice(0, 10);
}

function _sumarDias(s, n) {
  const d = _aDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return _aTexto(d);
}

function sumarMeses(s, n) {
  const d = _aDate(s);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return _aTexto(d);
}

/**
 * feriados: [{ fecha: 'YYYY-MM-DD', ambito: 'nacional' | 'SCZ' | 'LPZ' | 'CBBA' }]
 * Un feriado departamental solo cuenta para contactos de esa ciudad.
 */
function esFeriado(fecha, feriados = [], ciudad = null) {
  return feriados.some((f) => {
    const ff = normalizarFecha(f.fecha);
    const ambito = String(f.ambito || 'nacional').trim();
    return ff === fecha && (ambito === 'nacional' || (ciudad && ambito === ciudad));
  });
}

function esDiaHabil(fecha, feriados = [], ciudad = null) {
  const dow = _aDate(fecha).getUTCDay(); // 0 domingo, 6 sábado
  return dow !== 0 && dow !== 6 && !esFeriado(fecha, feriados, ciudad);
}

/** Suma n días hábiles. Con n = 0 devuelve la misma fecha si es hábil, o el siguiente hábil. */
function sumarDiasHabiles(fecha, n, feriados = [], ciudad = null) {
  let actual = fecha;
  if (n === 0) {
    while (!esDiaHabil(actual, feriados, ciudad)) actual = _sumarDias(actual, 1);
    return actual;
  }
  let contados = 0;
  while (contados < n) {
    actual = _sumarDias(actual, 1);
    if (esDiaHabil(actual, feriados, ciudad)) contados++;
  }
  return actual;
}

function diaHabilAnterior(fecha, feriados = [], ciudad = null) {
  let actual = _sumarDias(fecha, -1);
  while (!esDiaHabil(actual, feriados, ciudad)) actual = _sumarDias(actual, -1);
  return actual;
}

// ───────────────────────── Teléfonos ─────────────────────────

/**
 * Normaliza un teléfono boliviano a E.164 y lo clasifica.
 * Regla (a validar con datos reales): 8 dígitos que empiezan con 6 o 7 = celular;
 * 8 dígitos que empiezan con 2, 3 o 4 = fijo (incluye el código de área).
 * Un fijo de 7 dígitos se completa con el código de área de la ciudad si se conoce.
 */
function normalizarTelefono(raw, ciudad = null) {
  const vacio = { e164: '', tipo: 'sin_telefono', nacional: '' };
  if (!raw) return vacio;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return vacio;
  if (d.startsWith('00591')) d = d.slice(5);
  else if (d.startsWith('591') && d.length >= 10) d = d.slice(3);
  if (d.length === 9 && d.startsWith('0')) d = d.slice(1); // 0 de larga distancia
  if (d.length === 7 && ciudad && CIUDADES[ciudad] && /^[2-4]/.test(d)) {
    d = CIUDADES[ciudad].codigoArea + d;
  }
  if (d.length !== 8) return { e164: '', tipo: 'otro', nacional: d };
  if (/^[67]/.test(d)) return { e164: `+591${d}`, tipo: 'celular', nacional: d };
  if (/^[234]/.test(d)) return { e164: `+591${d}`, tipo: 'fijo', nacional: d };
  return { e164: '', tipo: 'otro', nacional: d };
}

// ───────────────────────── Empresas y puntaje ─────────────────────────

function esWebPropia(url) {
  if (!url) return false;
  let host;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  host = host.replace(/^www\./, '');
  return !DOMINIOS_NO_PROPIOS.some((dom) => host === dom || host.endsWith(`.${dom}`));
}

/** Nombre comparable para detectar sucursales de la misma empresa. */
function normalizarNombre(nombre) {
  if (!nombre) return '';
  let s = String(nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.split(/\s[-–|]\s|\(/)[0];
  s = s.replace(/[.,]/g, ' ');
  const ruido = new Set(['sucursal', 'suc', 'agencia', 'sede', 'srl', 's', 'r', 'l', 'sa', 'a', 'ltda', 'oficina', 'central', 'matriz']);
  return s
    .split(/\s+/)
    .filter((w) => w && !ruido.has(w))
    .join(' ')
    .trim();
}

/** Cuenta cuántas fichas comparten nombre normalizado. Devuelve Map nombre → cantidad. */
function contarSucursales(nombres) {
  const m = new Map();
  for (const n of nombres) {
    const k = normalizarNombre(n);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/**
 * Puntaje base automático (0–10), sección 2 del plan.
 * e: { resenas, web, sector, telTipo, sucursales, businessStatus }
 */
function puntajeBase(e, sectoresPrioritarios = SECTORES_PRIORITARIOS) {
  const detalle = [];
  if (e.businessStatus && e.businessStatus !== 'OPERATIONAL') {
    return { puntaje: 0, descartar: true, detalle: [`estado ${e.businessStatus}`] };
  }
  let p = 0;
  const suma = (n, motivo) => {
    p += n;
    detalle.push(`${n > 0 ? '+' : ''}${n} ${motivo}`);
  };
  if ((Number(e.sucursales) || 0) >= 2) suma(3, 'varias sucursales');
  const r = Number(e.resenas) || 0;
  if (r >= 100) suma(2, 'reseñas ≥ 100');
  else if (r >= 30) suma(1, 'reseñas ≥ 30');
  if (sectoresPrioritarios.includes(e.sector)) suma(2, 'sector prioritario');
  if (e.telTipo === 'celular') suma(2, 'celular visible');
  const webPropia = esWebPropia(e.web);
  if (webPropia) suma(1, 'web propia');
  if (e.telTipo !== 'celular' && !webPropia) suma(-2, 'solo fijo y sin web');
  return { puntaje: Math.max(0, Math.min(10, p)), descartar: false, detalle };
}

function prioridad(puntajeFinal, umbrales = UMBRALES_DEFECTO) {
  if (puntajeFinal === '' || puntajeFinal === null || puntajeFinal === undefined) return '';
  const s = Number(puntajeFinal);
  if (s >= umbrales.A) return 'A';
  if (s >= umbrales.B) return 'B';
  return 'C';
}

function canalInicial(telTipo) {
  if (telTipo === 'celular') return 'WhatsApp';
  if (telTipo === 'fijo') return 'llamada';
  return 'LinkedIn';
}

/** Convierte un lugar de Places (New) en una fila de la hoja `empresas` (sin sucursales ni puntaje). */
function mapearPlace(place, consulta = {}) {
  const tel = place.internationalPhoneNumber || place.nationalPhoneNumber || '';
  const t = normalizarTelefono(tel, consulta.ciudad);
  return {
    place_id: place.id || '',
    empresa: (place.displayName && place.displayName.text) || '',
    ciudad: consulta.ciudad || '',
    zona: consulta.zona || '',
    sector: consulta.sector || '',
    consulta_origen: consulta.id || consulta.texto_consulta || '',
    tel_publico: t.e164 || tel,
    tel_tipo: t.tipo === 'otro' ? 'fijo' : t.tipo,
    web: place.websiteUri || '',
    resenas: place.userRatingCount || 0,
    direccion: place.formattedAddress || '',
    business_status: place.businessStatus || '',
    tipos: (place.types || []).join(','),
  };
}

// ───────────────────────── Plantillas y enlaces ─────────────────────────

/** Reemplaza {variables}. Devuelve { texto, faltantes } con las variables sin valor. */
function rellenarPlantilla(texto, vars = {}) {
  const faltantes = [];
  const out = String(texto || '').replace(/\{([a-z_]+)\}/g, (todo, k) => {
    const v = vars[k];
    if (v === undefined || v === null || String(v).trim() === '' || v === 'COMPLETAR') {
      if (!faltantes.includes(k)) faltantes.push(k);
      return todo;
    }
    return String(v).trim();
  });
  return { texto: out, faltantes };
}

/** Inserta "Vi que {dato}." después de la segunda oración (plantillas al gerente). */
function insertarDato(texto, dato) {
  if (!dato || !String(dato).trim()) return texto;
  let d = String(dato).trim().replace(/[.\s]+$/, '');
  d = d.charAt(0).toLowerCase() + d.slice(1);
  const oraciones = String(texto).split(/(?<=[.?!])\s+/);
  if (oraciones.length < 3) return `${texto} Vi que ${d}.`;
  oraciones.splice(2, 0, `Vi que ${d}.`);
  return oraciones.join(' ');
}

function waLink(telefono, texto) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  if (!digitos) return '';
  return `https://wa.me/${digitos}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

/** Variables de plantilla a partir de config, empresa y contacto. */
function variablesMensaje({ config = {}, empresa = {}, contacto = {} }) {
  const ciudad = contacto.ciudad || empresa.ciudad;
  return {
    mi_nombre: config.mi_nombre,
    mi_cargo: config.mi_cargo,
    mi_numero: config.mi_numero,
    sitio_web: config.sitio_web,
    empresa: empresa.empresa || contacto.empresa,
    ciudad: (CIUDADES[ciudad] && CIUDADES[ciudad].nombre) || ciudad,
    sector: SECTOR_FRASE[empresa.sector] || (empresa.sector || '').toLowerCase(),
    dato_personalizacion: empresa.dato_personalizacion,
    nombre: contacto.nombre,
    persona_derivo: contacto.persona_derivo,
    responsable_reunion: contacto.responsable_reunion,
  };
}

// ───────────────────────── Exclusión ─────────────────────────

const PATRONES_BAJA = [
  // "no me escriba", "no nos escriban más", "no me vuelva a contactar", "no molestar", "no me llamen"
  /\bno\s+(me\s+|nos\s+)?(vuelva[ns]?\s+a\s+)?(escrib(a|an|as|ir|irme|irnos)|contact(e|en|es|ar|arme|arnos)|molest(e|en|es|ar)|llam(e|en|es|ar))\b/i,
  // "dejen de escribirme"
  /\bdej(e|en|es)\s+de\s+(escribir|contactar|molestar|llamar)/i,
  // "denme de baja", "quiero darme de baja"
  /\b(dar|darme|darnos|den|denme|deme)\s+de\s+baja\b/i,
  // el mensaje es solo "baja" o "stop"
  /^\s*(baja|stop|alto)\s*[.!]*\s*$/i,
  /\b(stop|unsubscribe)\b/i,
  /\b(borr|elimin)\w*\s+(mi|nuestro)\s+(n[uú]mero|contacto)/i,
];

/** true si el texto pide no recibir más mensajes. */
function detectarBaja(texto) {
  if (!texto) return false;
  const s = String(texto).normalize('NFC');
  return PATRONES_BAJA.some((p) => p.test(s));
}

function _norm(v) {
  return String(v || '').trim().toLowerCase();
}

/** Construye conjuntos de búsqueda a partir de las filas de `exclusion`. */
function indiceExclusion(filas = []) {
  const idx = { telefonos: new Set(), places: new Set(), linkedin: new Set(), correos: new Set() };
  for (const f of filas) {
    const t = normalizarTelefono(f.telefono_e164).e164 || String(f.telefono_e164 || '').replace(/\D/g, '');
    if (t) idx.telefonos.add(t.replace(/\D/g, ''));
    if (f.place_id) idx.places.add(_norm(f.place_id));
    if (f.linkedin_url) idx.linkedin.add(_norm(f.linkedin_url).replace(/\/+$/, ''));
    if (f.correo) idx.correos.add(_norm(f.correo));
  }
  return idx;
}

function estaExcluido(contacto, idx) {
  const tel = String(contacto.telefono_e164 || '').replace(/\D/g, '');
  return Boolean(
    (tel && idx.telefonos.has(tel)) ||
      (contacto.place_id && idx.places.has(_norm(contacto.place_id))) ||
      (contacto.linkedin_url && idx.linkedin.has(_norm(contacto.linkedin_url).replace(/\/+$/, ''))) ||
      (contacto.correo && idx.correos.has(_norm(contacto.correo)))
  );
}

// ───────────────────────── Motor de estados ─────────────────────────

/**
 * Estados de envío ("fases"). Tras el k-ésimo mensaje sin respuesta se espera esperas[k-1]
 * días hábiles. Al vencer: si hay seguimientos[k-1], toca enviarlo; si no, se cierra.
 * Ninguna fase pasa de 3 mensajes sin respuesta (regla del plan).
 */
const FASES = {
  SALUDO_ENVIADO: { esperas: [2, 2], seguimientos: ['REC_SEG_SALUDO'] },
  MSJ_LARGO_ENVIADO: { esperas: [3, 3], seguimientos: ['REC_SEG_DERIVACION'] },
  MSJ_GERENTE_ENVIADO: { esperas: [3, 7, 7], seguimientos: ['GER_SEG_1', 'GER_SEG_FINAL'] },
  LI_INVITACION_ENVIADA: { esperas: [15], seguimientos: [], cierre: 'Retirar la invitación en LinkedIn y cerrar' },
  LI_MSJ_ENVIADO: { esperas: [7, 7], seguimientos: ['LI_SEGUIMIENTO'] },
};

const TERMINALES = ['GANADO', 'PERDIDO', 'DESCARTADO', 'CERRADO_SIN_RESPUESTA', 'NO_CONTACTAR', 'GERENTE_CONSEGUIDO'];

const MAX_SIN_RESPUESTA = 3;

for (const [k, f] of Object.entries(FASES)) {
  if (f.esperas.length > MAX_SIN_RESPUESTA) throw new Error(`Fase ${k} supera ${MAX_SIN_RESPUESTA} mensajes`);
}

function elegirPrimeraPlantilla(c) {
  const canal = c.canal || 'WhatsApp';
  if (canal === 'LinkedIn') return { plantilla: 'LI_INVITACION', accion: 'Enviar invitación en LinkedIn' };
  if (canal === 'llamada') return { plantilla: '', accion: 'Llamar a recepción y pedir contacto de gerencia' };
  if (c.rol_contacto === 'gerente') {
    if (canal === 'correo') return { plantilla: 'GER_CORREO', accion: 'Enviar correo al gerente' };
    if (c.origen_contacto === 'derivado_recepcion') return { plantilla: 'GER_DERIVADO', accion: 'Enviar primer mensaje al gerente' };
    if (c.origen_contacto === 'presentacion_jefe') return { plantilla: '', accion: 'Escribir al gerente tras la presentación del jefe' };
    return { plantilla: 'GER_FRIO', accion: 'Enviar primer mensaje al gerente' };
  }
  if (canal === 'correo') return { plantilla: '', accion: 'Escribir correo a la empresa' };
  if (c.variante_mensaje === 'B') return { plantilla: 'REC_DIRECTO_B', accion: 'Enviar mensaje a recepción (variante B)' };
  return { plantilla: 'REC_SALUDO_A', accion: 'Enviar saludo a recepción (variante A)' };
}

/** Programación tras el k-ésimo envío en una fase. */
function _programarFase(estado, k, hoy, feriados, ciudad) {
  const f = FASES[estado];
  const idx = Math.min(k, f.esperas.length) - 1;
  const fecha = sumarDiasHabiles(hoy, f.esperas[idx], feriados, ciudad);
  if (k <= f.seguimientos.length) {
    return { proxima_accion: `Enviar seguimiento ${k} si no responde`, plantilla_siguiente: f.seguimientos[k - 1], fecha_proxima: fecha };
  }
  return { proxima_accion: f.cierre || 'Cerrar si no responde (automático)', plantilla_siguiente: '', fecha_proxima: fecha };
}

/**
 * Calcula el efecto de un evento sobre un contacto.
 *
 * contacto: fila de `contactos` (estado = estado ANTES del evento).
 * evento:
 *   { tipo: 'cambio_estado', estado }   Diego cambió el estado en la planilla o la web
 *   { tipo: 'envio' }                   envió un seguimiento sin cambiar de fase
 *   { tipo: 'respuesta', texto }        llegó una respuesta (pegada en la ficha)
 *   { tipo: 'vencimiento' }             la fecha_proxima pasó (lo lanza la cola diaria)
 * ctx: { hoy, feriados, empresaYaContactada, ahora ('YYYY-MM-DD HH:mm', hora de Bolivia), registradoPor }
 *
 * Devuelve { cambios, acciones, evento, avisos }. `evento` es la fila para la hoja `eventos`.
 */
function procesarEvento(contacto, evento, ctx = {}) {
  const hoy = ctx.hoy || hoyBolivia();
  const feriados = ctx.feriados || [];
  const ciudad = contacto.ciudad || null;
  const previo = contacto.estado || '';
  const nPrevio = Number(contacto.n_envios_sin_resp) || 0;
  const avisos = [];
  const acciones = [];
  let nuevo = previo;
  let cambios = {};
  let esEnvio = false;

  if (previo === 'NO_CONTACTAR') {
    const cambiosNC = evento.tipo === 'cambio_estado' && evento.estado !== 'NO_CONTACTAR' ? { estado: 'NO_CONTACTAR' } : {};
    return { cambios: cambiosNC, acciones: [], evento: null, avisos: ['NO_CONTACTAR es definitivo: no se cambia nada.'] };
  }

  if (evento.tipo === 'respuesta' || evento.tipo === 'nota') {
    if (detectarBaja(evento.texto)) {
      nuevo = 'NO_CONTACTAR';
      avisos.push('Se detectó un pedido de no recibir más mensajes: el contacto pasa a NO_CONTACTAR.');
    } else if (evento.tipo === 'nota') {
      return { cambios: {}, acciones: [], evento: null, avisos };
    } else if (FASES[previo] || previo === 'CERRADO_SIN_RESPUESTA') {
      nuevo = previo === 'LI_INVITACION_ENVIADA' ? 'LI_CONECTADO' : 'RESPONDIO';
    } else {
      // Respuesta en un estado sin envío pendiente (p. ej. REUNION_AGENDADA): no cambia nada.
      return { cambios: {}, acciones: [], evento: null, avisos };
    }
  } else if (evento.tipo === 'cambio_estado') {
    nuevo = evento.estado;
    if (nuevo === previo && FASES[nuevo]) esEnvio = true; // mismo estado de envío = otro mensaje
  } else if (evento.tipo === 'envio') {
    if (!FASES[previo]) {
      return { cambios: {}, acciones: [], evento: null, avisos: [`"Enviado" no aplica en el estado ${previo || '(vacío)'}.`] };
    }
    esEnvio = true;
  } else if (evento.tipo === 'vencimiento') {
    const f = FASES[previo];
    if (f && nPrevio >= f.esperas.length) {
      nuevo = 'CERRADO_SIN_RESPUESTA';
    } else {
      return { cambios: {}, acciones: [], evento: null, avisos };
    }
  } else {
    throw new Error(`Tipo de evento desconocido: ${evento.tipo}`);
  }

  // ── Envío dentro de una fase (seguimiento) ──
  if (esEnvio) {
    const k = nPrevio + 1;
    const f = FASES[previo];
    if (k > f.esperas.length) {
      avisos.push(`Ya se enviaron ${nPrevio} mensajes sin respuesta: no corresponde otro.`);
      return { cambios: {}, acciones: [], evento: null, avisos };
    }
    cambios = { n_envios_sin_resp: k, fecha_ultimo_envio: hoy, ..._programarFase(previo, k, hoy, feriados, ciudad) };
    return { cambios, acciones, evento: _filaEvento(contacto, previo, 'SEGUIMIENTO_ENVIADO', ctx, false, `seguimiento ${k - 1}`), avisos };
  }

  // ── Entrada a un estado nuevo ──
  cambios.estado = nuevo;
  const fechaHoy = sumarDiasHabiles(hoy, 0, feriados, ciudad);

  if (FASES[nuevo]) {
    cambios = { ...cambios, n_envios_sin_resp: 1, fecha_ultimo_envio: hoy, ..._programarFase(nuevo, 1, hoy, feriados, ciudad) };
    const primer = !ctx.empresaYaContactada;
    return { cambios, acciones, evento: _filaEvento(contacto, previo, nuevo, ctx, primer), avisos };
  }

  switch (nuevo) {
    case 'LISTO': {
      const p = elegirPrimeraPlantilla(contacto);
      Object.assign(cambios, { n_envios_sin_resp: 0, proxima_accion: p.accion, plantilla_siguiente: p.plantilla, fecha_proxima: fechaHoy });
      acciones.push('preparar_mensaje');
      break;
    }
    case 'RESPONDIO': {
      const plantilla = previo === 'SALUDO_ENVIADO' ? 'REC_PRESENTACION' : '';
      Object.assign(cambios, {
        n_envios_sin_resp: 0,
        proxima_accion: plantilla ? 'Enviar la presentación hoy (pedir contacto de gerencia)' : 'Responder hoy',
        plantilla_siguiente: plantilla,
        fecha_proxima: fechaHoy,
      });
      if (plantilla) acciones.push('preparar_mensaje');
      break;
    }
    case 'GERENTE_CONSEGUIDO':
      Object.assign(cambios, { n_envios_sin_resp: 0, proxima_accion: 'Escribir al gerente en ≤ 24 h (contacto nuevo)', plantilla_siguiente: '', fecha_proxima: '' });
      acciones.push('crear_contacto_gerente');
      break;
    case 'LI_CONECTADO':
      Object.assign(cambios, { n_envios_sin_resp: 0, proxima_accion: 'Enviar mensaje de agradecimiento hoy', plantilla_siguiente: 'LI_AL_ACEPTAR', fecha_proxima: fechaHoy });
      acciones.push('preparar_mensaje');
      break;
    case 'REUNION_AGENDADA': {
      const fr = normalizarFecha(contacto.fecha_reunion);
      cambios.n_envios_sin_resp = 0;
      if (!fr) {
        Object.assign(cambios, { proxima_accion: 'Completar fecha_reunion', plantilla_siguiente: '', fecha_proxima: fechaHoy });
        avisos.push('Falta fecha_reunion: no se pudo programar el recordatorio ni el evento.');
      } else {
        let rec = diaHabilAnterior(fr, feriados, ciudad);
        if (rec < hoy) rec = hoy;
        Object.assign(cambios, { proxima_accion: 'Enviar recordatorio de la reunión', plantilla_siguiente: 'REU_RECORDATORIO', fecha_proxima: rec });
        acciones.push('crear_evento_calendar', 'preparar_ficha_traspaso');
      }
      break;
    }
    case 'REUNION_1_HECHA':
      Object.assign(cambios, { n_envios_sin_resp: 0, proxima_accion: 'Enviar propuesta', plantilla_siguiente: '', fecha_proxima: sumarDiasHabiles(hoy, 5, feriados, ciudad) });
      break;
    case 'PROPUESTA_ENVIADA':
      Object.assign(cambios, { n_envios_sin_resp: 0, proxima_accion: 'Seguimiento de la propuesta', plantilla_siguiente: '', fecha_proxima: sumarDiasHabiles(hoy, 5, feriados, ciudad) });
      break;
    case 'REUNION_2':
      Object.assign(cambios, { n_envios_sin_resp: 0, proxima_accion: 'Seguimiento después de la reunión 2', plantilla_siguiente: '', fecha_proxima: sumarDiasHabiles(hoy, 5, feriados, ciudad) });
      break;
    case 'CERRADO_SIN_RESPUESTA':
      Object.assign(cambios, { proxima_accion: `Reactivable desde ${sumarMeses(hoy, 6)}`, plantilla_siguiente: '', fecha_proxima: '' });
      break;
    case 'NO_CONTACTAR':
      Object.assign(cambios, { proxima_accion: 'Nunca más (en exclusión)', plantilla_siguiente: '', fecha_proxima: '' });
      acciones.push('agregar_exclusion', 'marcar_empresa_no_contactar', 'avisar');
      break;
    case 'GANADO':
    case 'PERDIDO':
    case 'DESCARTADO':
      Object.assign(cambios, { proxima_accion: '', plantilla_siguiente: '', fecha_proxima: '' });
      break;
    default:
      throw new Error(`Estado desconocido: ${nuevo}`);
  }
  return { cambios, acciones, evento: _filaEvento(contacto, previo, nuevo, ctx, false), avisos };
}

function _filaEvento(c, previo, nuevo, ctx, primerContacto, nota = '') {
  return {
    fecha: ctx.ahora || ahoraBolivia(),
    contacto_id: c.contacto_id || '',
    place_id: c.place_id || '',
    estado_anterior: previo,
    estado_nuevo: nuevo,
    canal: c.canal || '',
    variante: c.variante_mensaje || '',
    ciudad: c.ciudad || '',
    primer_contacto: primerContacto ? 'SI' : 'NO',
    registrado_por: ctx.registradoPor || 'n8n',
    nota,
  };
}

// ───────────────────────── Cola diaria ─────────────────────────

const ESTADOS_ACCIONABLES = new Set([
  'LISTO', 'RESPONDIO', 'LI_CONECTADO', 'REUNION_AGENDADA', 'REUNION_1_HECHA', 'PROPUESTA_ENVIADA', 'REUNION_2',
  ...Object.keys(FASES),
]);

/**
 * Arma la cola del día (F3).
 * contactos: filas de `contactos`; empresasPorPlace: { place_id: fila empresa }.
 * Devuelve { cola, cerrar, excluidos, fueraDeLimite }.
 *  - cerrar: contactos con plazo vencido y sin mensajes restantes (se cierran solos).
 *  - cola: primero pendientes (seguimientos y otras acciones vencidas), luego nuevos A y B.
 */
function armarCola(contactos, { hoy = hoyBolivia(), exclusion = [], empresasPorPlace = {}, limiteNuevos = 20 } = {}) {
  const idx = indiceExclusion(exclusion);
  const pendientes = [];
  const nuevos = [];
  const cerrar = [];
  const excluidos = [];
  for (const c of contactos) {
    if (!ESTADOS_ACCIONABLES.has(c.estado)) continue;
    const fp = normalizarFecha(c.fecha_proxima);
    if (c.estado !== 'LISTO' && (!fp || fp > hoy)) continue;
    if (c.estado === 'LISTO' && fp && fp > hoy) continue;
    const emp = empresasPorPlace[c.place_id] || {};
    if (estaExcluido(c, idx) || emp.estado_empresa === 'NO_CONTACTAR') {
      excluidos.push(c);
      continue;
    }
    const f = FASES[c.estado];
    if (f && (Number(c.n_envios_sin_resp) || 0) >= f.esperas.length) {
      cerrar.push(c);
      continue;
    }
    const item = { ...c, prioridad: emp.prioridad || prioridad(emp.puntaje_final) || '', dato_personalizacion: emp.dato_personalizacion || '' };
    if (c.estado === 'LISTO') {
      if (item.prioridad === 'C') continue;
      nuevos.push(item);
    } else {
      pendientes.push(item);
    }
  }
  const ordenPrioridad = { A: 0, B: 1, '': 2 };
  pendientes.sort((a, b) => String(normalizarFecha(a.fecha_proxima)).localeCompare(String(normalizarFecha(b.fecha_proxima))));
  nuevos.sort((a, b) => (ordenPrioridad[a.prioridad] ?? 2) - (ordenPrioridad[b.prioridad] ?? 2));
  return {
    cola: [...pendientes, ...nuevos.slice(0, limiteNuevos)],
    cerrar,
    excluidos,
    fueraDeLimite: nuevos.slice(limiteNuevos),
  };
}

const API = {
  ZONA_HORARIA, CIUDADES, SECTOR_FRASE, SECTORES_PRIORITARIOS, UMBRALES_DEFECTO, FASES, TERMINALES, MAX_SIN_RESPUESTA,
  hoyBolivia, ahoraBolivia, normalizarFecha, sumarMeses, esFeriado, esDiaHabil, sumarDiasHabiles, diaHabilAnterior,
  normalizarTelefono, esWebPropia, normalizarNombre, contarSucursales, puntajeBase, prioridad, canalInicial, mapearPlace,
  rellenarPlantilla, insertarDato, waLink, variablesMensaje,
  detectarBaja, indiceExclusion, estaExcluido,
  elegirPrimeraPlantilla, procesarEvento, armarCola,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
