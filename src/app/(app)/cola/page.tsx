import { Inbox, PartyPopper } from "lucide-react";
import { Encabezado, Pagina, Vacio } from "@/components/comunes";
import { Progress } from "@/components/ui/progress";
import { colaDelDia, contexto, usuarioActual } from "@/lib/datos";
import type { Material } from "@/lib/tipos";
import { ColaTrabajo } from "./cola-trabajo";

export const metadata = { title: "Cola" };
export const dynamic = "force-dynamic";

const PLANTILLAS_RAPIDAS = ["REC_PRESENTACION", "REC_QUE_SE_TRATA", "REC_SIN_NUMERO_1", "REC_SIN_NUMERO_2", "OBJ_YA_TIENEN", "OBJ_MANDAME_INFO", "OBJ_PRECIO", "OBJ_SIN_PRESUPUESTO", "OBJ_DE_DONDE", "OBJ_ES_BOT", "OBJ_NO_INTERESA", "REU_CONFIRMACION", "REU_RECORDATORIO", "REU_ENLACE"];

export default async function ColaPage() {
  const { sb, nombre } = await usuarioActual();
  const [cola, ctx, mats, perfiles] = await Promise.all([
    colaDelDia(),
    contexto(),
    sb.from("materiales").select("*").order("orden").order("creado", { ascending: false }),
    sb.from("perfiles").select("nombre"),
  ]);
  const pendientes = cola.items.filter((i) => i.tipo === "pendiente").length;
  const nuevos = cola.items.length - pendientes;
  const faltaConfig = ["mi_cargo", "mi_numero", "sitio_web"].filter((k) => !ctx.config[k] || ctx.config[k] === "COMPLETAR");

  return (
    <Pagina className="max-w-7xl">
      <Encabezado
        titulo="Cola de hoy"
        descripcion={
          cola.feriado
            ? "Hoy es feriado o fin de semana: no se envían mensajes nuevos."
            : `${pendientes} seguimientos y respuestas · ${nuevos} nuevos${cola.fueraDeLimite ? ` · ${cola.fueraDeLimite} esperan al próximo día` : ""}`
        }
      >
        <div className="w-full space-y-1.5 sm:w-56">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Chats nuevos hoy</span>
            <span className="font-medium tabular-nums">
              {cola.nuevosHoy} / {cola.limite}
            </span>
          </div>
          <Progress value={Math.min(100, (100 * cola.nuevosHoy) / Math.max(1, cola.limite))} />
        </div>
      </Encabezado>

      {faltaConfig.length > 0 && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Completa en <a href="/config" className="font-medium underline">Configuración</a>: {faltaConfig.join(", ")}. Los mensajes que los usan quedan con huecos.
        </p>
      )}

      {cola.items.length === 0 ? (
        cola.nuevosHoy > 0 ? (
          <Vacio icono={PartyPopper} titulo="¡Cola terminada!">
            Enviaste {cola.nuevosHoy} chats nuevos hoy. Revisa empresas para mañana o atiende respuestas.
          </Vacio>
        ) : (
          <Vacio icono={Inbox} titulo="No hay nada en la cola">
            Aprueba empresas en <a className="underline" href="/revisar">Revisar</a> para que aparezcan aquí.
          </Vacio>
        )
      ) : (
        <ColaTrabajo
          items={cola.items}
          materiales={(mats.data ?? []) as Material[]}
          plantillasRapidas={PLANTILLAS_RAPIDAS.filter((p) => ctx.plantillas[p])}
          responsables={[...new Set([nombre, ...(perfiles.data ?? []).map((p) => p.nombre)].filter(Boolean))]}
          bloquearNuevos={cola.feriado}
        />
      )}
    </Pagina>
  );
}
