export const CIUDADES = { SCZ: "Santa Cruz", LPZ: "La Paz", CBBA: "Cochabamba" } as const;
export type Ciudad = keyof typeof CIUDADES;

export const SECTORES = [
  "Comercio / importación",
  "Salud",
  "Logística",
  "Industria",
  "Construcción / inmobiliaria",
  "Servicios",
  "Educación",
  "Agro",
];

type Tono = "neutro" | "info" | "espera" | "exito" | "alerta" | "peligro" | "apagado";

/** Etiqueta legible y tono visual de cada estado de contacto. */
export const ESTADOS: Record<string, { etiqueta: string; tono: Tono; grupo: string }> = {
  LISTO: { etiqueta: "Listo para enviar", tono: "info", grupo: "Por contactar" },
  SALUDO_ENVIADO: { etiqueta: "Saludo enviado", tono: "espera", grupo: "Recepción" },
  MSJ_LARGO_ENVIADO: { etiqueta: "Presentación enviada", tono: "espera", grupo: "Recepción" },
  RESPONDIO: { etiqueta: "Respondió", tono: "alerta", grupo: "Recepción" },
  GERENTE_CONSEGUIDO: { etiqueta: "Gerente conseguido", tono: "exito", grupo: "Recepción" },
  MSJ_GERENTE_ENVIADO: { etiqueta: "Mensaje al gerente", tono: "espera", grupo: "Gerencia" },
  LI_INVITACION_ENVIADA: { etiqueta: "Invitación LinkedIn", tono: "espera", grupo: "Gerencia" },
  LI_CONECTADO: { etiqueta: "Conectado en LinkedIn", tono: "alerta", grupo: "Gerencia" },
  LI_MSJ_ENVIADO: { etiqueta: "Mensaje LinkedIn", tono: "espera", grupo: "Gerencia" },
  REUNION_AGENDADA: { etiqueta: "Reunión agendada", tono: "exito", grupo: "Reuniones" },
  REUNION_1_HECHA: { etiqueta: "Reunión 1 hecha", tono: "exito", grupo: "Reuniones" },
  PROPUESTA_ENVIADA: { etiqueta: "Propuesta enviada", tono: "exito", grupo: "Reuniones" },
  REUNION_2: { etiqueta: "Reunión 2", tono: "exito", grupo: "Reuniones" },
  GANADO: { etiqueta: "Ganado", tono: "exito", grupo: "Cerrados" },
  PERDIDO: { etiqueta: "Perdido", tono: "apagado", grupo: "Cerrados" },
  CERRADO_SIN_RESPUESTA: { etiqueta: "Sin respuesta", tono: "apagado", grupo: "Cerrados" },
  DESCARTADO: { etiqueta: "Descartado", tono: "apagado", grupo: "Cerrados" },
  NO_CONTACTAR: { etiqueta: "No contactar", tono: "peligro", grupo: "Cerrados" },
};

/** Eventos del historial que no son un estado del contacto. */
export const EVENTOS_EXTRA: Record<string, { etiqueta: string; tono: "neutro" | "info" | "espera" | "exito" }> = {
  SEGUIMIENTO_ENVIADO: { etiqueta: "Seguimiento enviado", tono: "espera" },
  MENSAJE_ENVIADO: { etiqueta: "Mensaje enviado", tono: "neutro" },
  MATERIAL_ENVIADO: { etiqueta: "Material enviado", tono: "info" },
  REUNION_REPROGRAMADA: { etiqueta: "Reunión reprogramada", tono: "exito" },
};

export const TONO_CLASES: Record<Tono, string> = {
  neutro: "bg-muted text-foreground",
  info: "bg-primary/10 text-primary",
  espera: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  exito: "bg-success/12 text-success",
  alerta: "bg-warning/20 text-warning-foreground dark:text-warning",
  peligro: "bg-destructive/10 text-destructive",
  apagado: "bg-muted text-muted-foreground",
};

export const ESTADOS_EMPRESA: Record<string, string> = {
  NUEVA: "Nueva",
  EN_REVISION: "En revisión",
  LISTA: "Lista",
  EN_CURSO: "En curso",
  DESCARTADA: "Descartada",
  NO_CONTACTAR: "No contactar",
};

/** Estado al que pasa un contacto cuando se envía la plantilla indicada. */
export const ESTADO_TRAS_PLANTILLA: Record<string, string> = {
  REC_SALUDO_A: "SALUDO_ENVIADO",
  REC_DIRECTO_B: "MSJ_LARGO_ENVIADO",
  REC_PRESENTACION: "MSJ_LARGO_ENVIADO",
  GER_DERIVADO: "MSJ_GERENTE_ENVIADO",
  GER_FRIO: "MSJ_GERENTE_ENVIADO",
  GER_CORREO: "MSJ_GERENTE_ENVIADO",
  LI_INVITACION: "LI_INVITACION_ENVIADA",
  LI_AL_ACEPTAR: "LI_MSJ_ENVIADO",
};

export const MOTIVOS_DESCARTE = [
  "No es empresa objetivo",
  "Muy chica",
  "Corporación o multinacional",
  "Institución pública u ONG",
  "Sucursal de otra empresa",
  "Ya es cliente o contacto",
  "Sin medio de contacto",
];

export const OBJECIONES: Record<string, { etiqueta: string; plantilla?: string }> = {
  no_interesa: { etiqueta: "No le interesa", plantilla: "OBJ_NO_INTERESA" },
  ya_tienen_sistema: { etiqueta: "Ya tienen sistema", plantilla: "OBJ_YA_TIENEN" },
  mandame_info: { etiqueta: "Mándame información", plantilla: "OBJ_MANDAME_INFO" },
  precio: { etiqueta: "¿Cuánto cuesta?", plantilla: "OBJ_PRECIO" },
  sin_presupuesto: { etiqueta: "Sin presupuesto", plantilla: "OBJ_SIN_PRESUPUESTO" },
  de_donde_numero: { etiqueta: "¿De dónde sacó mi número?", plantilla: "OBJ_DE_DONDE" },
  es_bot: { etiqueta: "¿Es un bot?", plantilla: "OBJ_ES_BOT" },
  que_se_trata: { etiqueta: "¿De qué se trata?", plantilla: "REC_QUE_SE_TRATA" },
};

/** Señales del puntaje de revisión humana (sección 2 del plan). Máximo 7. */
export const SENALES_REVISION = [
  { id: "li_51", etiqueta: "LinkedIn con 51–200 empleados", puntos: 2, excluye: "li_201" },
  { id: "li_201", etiqueta: "LinkedIn con 201+ empleados", puntos: 3, excluye: "li_51" },
  { id: "gerente", etiqueta: "Gerente identificable (LinkedIn o sitio)", puntos: 2 },
  { id: "sitio", etiqueta: "Sitio con catálogo, portal o «trabaja con nosotros»", puntos: 1 },
  { id: "conexion", etiqueta: "Conexión en común con alguien de Zékiri", puntos: 1 },
] as const;

/** Nombre legible de cada plantilla. */
export const NOMBRES_PLANTILLA: Record<string, string> = {
  REC_SALUDO_A: "Saludo corto (variante A)",
  REC_PRESENTACION: "Presentación (paso 2 de A)",
  REC_DIRECTO_B: "Presentación directa (variante B)",
  REC_QUE_SE_TRATA: "¿De qué se trata?",
  REC_SIN_NUMERO_1: "No dan el número (1)",
  REC_SIN_NUMERO_2: "No dan el número (2)",
  REC_SEG_SALUDO: "Seguimiento del saludo",
  REC_SEG_DERIVACION: "Seguimiento de la presentación",
  GER_DERIVADO: "Gerente (lo pasó recepción)",
  GER_FRIO: "Gerente (sin derivación)",
  GER_SEG_1: "Seguimiento al gerente",
  GER_SEG_FINAL: "Último seguimiento al gerente",
  GER_CORREO: "Correo al gerente",
  REU_CONFIRMACION: "Confirmar reunión",
  REU_RECORDATORIO: "Recordatorio (día anterior)",
  REU_ENLACE: "Enlace de la reunión (1 h antes)",
  REU_HOY: "Confirmación del día (presencial)",
  LI_INVITACION: "Invitación de LinkedIn",
  LI_AL_ACEPTAR: "Al aceptar en LinkedIn",
  LI_SEGUIMIENTO: "Seguimiento en LinkedIn",
  LI_PRESENTACION_JEFE: "Presentación del jefe",
  OBJ_DE_DONDE: "¿De dónde sacó mi número?",
  OBJ_ES_BOT: "¿Es un bot?",
  OBJ_MANDAME_INFO: "Mándame información",
  OBJ_NO_ESCRIBIR: "Pidió no recibir mensajes",
  OBJ_NO_INTERESA: "No le interesa",
  OBJ_PRECIO: "¿Cuánto cuesta?",
  OBJ_SIN_PRESUPUESTO: "Sin presupuesto",
  OBJ_YA_TIENEN: "Ya tienen sistema",
};

/** Muestra una nota del historial con el nombre de la plantilla en vez de su código. */
export function notaLegible(nota: string | null | undefined) {
  if (!nota) return "";
  return nota.replace(/\b([A-Z]{2,4}_[A-Z0-9_]+)\b(:?)/g, (todo, id: string, dos: string) => (NOMBRES_PLANTILLA[id] ? `${NOMBRES_PLANTILLA[id]}${dos}` : todo));
}

/** Orígenes que siempre pasan a Revisar aunque su puntaje base sea bajo (agregadas a mano o listas de otros). */
export const ORIGENES_SIEMPRE_REVISAR = ["manual", "ariel"];
export const filtroRevisar = (umbral: number) => `puntaje_base.gte.${umbral},consulta_origen.in.(${ORIGENES_SIEMPRE_REVISAR.join(",")})`;
