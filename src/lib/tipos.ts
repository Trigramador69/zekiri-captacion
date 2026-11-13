export type Empresa = {
  place_id: string;
  empresa: string;
  ciudad: string | null;
  zona: string | null;
  sector: string | null;
  consulta_origen: string | null;
  direccion: string | null;
  tel_publico: string | null;
  tel_tipo: string | null;
  web: string | null;
  resenas: number;
  sucursales: number;
  linkedin_empresa: string | null;
  empleados_li: string | null;
  puntaje_base: number | null;
  puntaje_detalle: string | null;
  puntaje_revision: number | null;
  puntaje_final: number;
  estado_empresa: string;
  motivo_descarte: string | null;
  canal_inicial: string | null;
  dato_personalizacion: string | null;
  fecha_alta: string;
  notas: string | null;
  whatsapp: string | null;
  correo: string | null;
  redes: { instagram?: string; facebook?: string; linkedin?: string; tiktok?: string } | null;
  web_leida: string | null;
};

export type Contacto = {
  contacto_id: string;
  place_id: string | null;
  rol_contacto: string;
  origen_contacto: string | null;
  persona_derivo: string | null;
  nombre: string | null;
  cargo: string | null;
  canal: string;
  telefono_e164: string | null;
  correo: string | null;
  linkedin_url: string | null;
  responsable_reunion: string | null;
  estado: string;
  plantilla_siguiente: string | null;
  variante_mensaje: string | null;
  mensaje_siguiente: string | null;
  fecha_ultimo_envio: string | null;
  n_envios_sin_resp: number;
  proxima_accion: string | null;
  fecha_proxima: string | null;
  ultima_respuesta: string | null;
  objecion: string | null;
  fecha_reunion: string | null;
  enlace_reunion: string | null;
  modalidad_reunion: string | null;
  resultado: string | null;
  notas: string | null;
  creado: string;
};

export type ContactoConEmpresa = Contacto & { empresas: Empresa | null };

export type Evento = {
  id: number;
  fecha: string;
  contacto_id: string | null;
  place_id: string | null;
  estado_anterior: string | null;
  estado_nuevo: string;
  canal: string | null;
  variante: string | null;
  ciudad: string | null;
  primer_contacto: boolean;
  registrado_por: string | null;
  nota: string | null;
  material_id: string | null;
};

export type Material = {
  id: string;
  titulo: string;
  descripcion: string | null;
  sector: string | null;
  tipo: string;
  archivo: string | null;
  url: string | null;
  peso_bytes: number | null;
  orden: number;
  creado: string;
};

export type Plantilla = { id: string; rol: string | null; canal: string | null; variante: string | null; texto: string; notas: string | null };

export type Contexto = {
  config: Record<string, string>;
  plantillas: Record<string, string>;
  feriados: { fecha: string; ambito: string }[];
};
