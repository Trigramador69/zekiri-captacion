import { MessagesSquare } from "lucide-react";
import { Encabezado, Pagina, Vacio } from "@/components/comunes";
import { contexto, usuarioActual, type ItemCola } from "@/lib/datos";
import { FASES, hoy, prioridadDe } from "@/lib/motor";
import type { ContactoConEmpresa, Material } from "@/lib/tipos";
import { ColaTrabajo, type Grupo } from "../cola/cola-trabajo";

export const metadata = { title: "Conversaciones" };
export const dynamic = "force-dynamic";

const ESPERANDO = Object.keys(FASES);
const RESPONDIERON = ["RESPONDIO", "LI_CONECTADO"];
const REUNIONES = ["REUNION_AGENDADA", "REUNION_1_HECHA", "PROPUESTA_ENVIADA", "REUNION_2"];

const GRUPOS: Grupo[] = [
  { k: "respondieron", etiqueta: "Respondieron", estados: RESPONDIERON },
  { k: "esperando", etiqueta: "Esperando respuesta", estados: ESPERANDO },
  { k: "reuniones", etiqueta: "Reuniones", estados: REUNIONES },
  { k: "por_escribir", etiqueta: "Por escribir", estados: ["LISTO"] },
  { k: "todo", etiqueta: "Todas" },
];

const PLANTILLAS_RAPIDAS = ["REC_PRESENTACION", "REC_QUE_SE_TRATA", "REC_SIN_NUMERO_1", "REC_SIN_NUMERO_2", "OBJ_YA_TIENEN", "OBJ_MANDAME_INFO", "OBJ_PRECIO", "OBJ_SIN_PRESUPUESTO", "OBJ_DE_DONDE", "OBJ_ES_BOT", "OBJ_NO_INTERESA", "REU_CONFIRMACION", "REU_RECORDATORIO", "REU_ENLACE"];

export default async function ConversacionesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { sb, nombre } = await usuarioActual();
  const ctx = await contexto();
  const [cs, mats, perfiles] = await Promise.all([
    sb
      .from("contactos")
      .select("*, empresas(*)")
      .in("estado", [...RESPONDIERON, ...ESPERANDO, ...REUNIONES, "LISTO"])
      .order("actualizado", { ascending: false })
      .limit(1000),
    sb.from("materiales").select("*").order("orden").order("creado", { ascending: false }),
    sb.from("perfiles").select("nombre"),
  ]);
  const h = hoy();
  const items: ItemCola[] = ((cs.data ?? []) as ContactoConEmpresa[])
    .map((x) => ({
      ...x,
      prioridad: x.empresas ? prioridadDe(x.empresas, ctx) : "",
      vencido: x.estado !== "LISTO" && !!x.fecha_proxima && x.fecha_proxima < h,
      tipo: (x.estado === "LISTO" ? "nuevo" : "pendiente") as ItemCola["tipo"],
    }))
    // Primero lo que toca hoy o está vencido; después por fecha; sin fecha al final.
    .sort((a, b) => (a.fecha_proxima ?? "9999").localeCompare(b.fecha_proxima ?? "9999"));

  return (
    <Pagina className="max-w-7xl">
      <Encabezado
        titulo="Conversaciones"
        descripcion="Todos los contactos en curso, aunque no les toque hoy. Si alguien te responde por WhatsApp, búscalo aquí por nombre o celular."
      />
      {items.length === 0 ? (
        <Vacio icono={MessagesSquare} titulo="Todavía no hay conversaciones">
          Cuando apruebes empresas y envíes los primeros mensajes, aparecen aquí.
        </Vacio>
      ) : (
        <ColaTrabajo
          modo="conversaciones"
          grupos={GRUPOS}
          seleccionInicial={c && items.some((i) => i.contacto_id === c) ? c : undefined}
          items={items}
          materiales={(mats.data ?? []) as Material[]}
          plantillasRapidas={PLANTILLAS_RAPIDAS.filter((p) => ctx.plantillas[p])}
          responsables={[...new Set([nombre, ...(perfiles.data ?? []).map((p) => p.nombre)].filter(Boolean))]}
          bloquearNuevos={false}
        />
      )}
    </Pagina>
  );
}
