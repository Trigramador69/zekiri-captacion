import Link from "next/link";
import { Encabezado, EstadoBadge, Pagina } from "@/components/comunes";
import { usuarioActual } from "@/lib/datos";
import { ESTADOS } from "@/lib/constantes";
import type { ContactoConEmpresa } from "@/lib/tipos";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

const COLUMNAS = [
  { titulo: "Por contactar", estados: ["LISTO"] },
  { titulo: "Recepción", estados: ["SALUDO_ENVIADO", "MSJ_LARGO_ENVIADO", "RESPONDIO"] },
  { titulo: "Gerencia", estados: ["MSJ_GERENTE_ENVIADO", "LI_INVITACION_ENVIADA", "LI_CONECTADO", "LI_MSJ_ENVIADO"] },
  { titulo: "Reuniones", estados: ["REUNION_AGENDADA", "REUNION_1_HECHA", "PROPUESTA_ENVIADA", "REUNION_2"] },
  { titulo: "Ganados", estados: ["GANADO"] },
];

export default async function PipelinePage() {
  const { sb } = await usuarioActual();
  const estados = COLUMNAS.flatMap((c) => c.estados);
  const [{ data }, cerrados] = await Promise.all([
    sb.from("contactos").select("*, empresas(empresa, ciudad, place_id)").in("estado", estados).order("actualizado", { ascending: false }).limit(500),
    sb.from("contactos").select("estado").in("estado", ["CERRADO_SIN_RESPUESTA", "PERDIDO", "DESCARTADO", "NO_CONTACTAR", "GERENTE_CONSEGUIDO"]),
  ]);
  const contactos = (data ?? []) as ContactoConEmpresa[];
  const resumenCerrados: Record<string, number> = {};
  for (const c of cerrados.data ?? []) resumenCerrados[c.estado] = (resumenCerrados[c.estado] ?? 0) + 1;

  return (
    <Pagina className="max-w-none">
      <Encabezado
        titulo="Pipeline"
        descripcion={
          Object.entries(resumenCerrados)
            .map(([k, v]) => `${v} ${ESTADOS[k]?.etiqueta.toLowerCase()}`)
            .join(" · ") || "Contactos activos por etapa"
        }
      />
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {COLUMNAS.map((col) => {
          const items = contactos.filter((c) => col.estados.includes(c.estado));
          return (
            <section key={col.titulo} className="w-72 shrink-0 snap-start rounded-2xl bg-muted/50 p-3">
              <header className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold">{col.titulo}</h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums">{items.length}</span>
              </header>
              <ul className="max-h-[calc(100dvh-240px)] space-y-2 overflow-y-auto">
                {items.map((c) => (
                  <li key={c.contacto_id}>
                    <Link
                      href={col.titulo === "Ganados" && c.empresas ? `/empresas/${encodeURIComponent(c.empresas.place_id)}` : `/conversaciones?c=${c.contacto_id}`}
                      className="block rounded-xl border bg-card p-3 shadow-xs transition-shadow hover:shadow-md"
                    >
                      <p className="truncate text-sm font-medium">{c.empresas?.empresa ?? c.nombre}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {c.rol_contacto === "gerente" ? c.nombre || "Gerente" : "Recepción"} · {c.empresas?.ciudad}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <EstadoBadge estado={c.estado} />
                        {c.fecha_proxima && <span className="text-[11px] text-muted-foreground">{c.fecha_proxima.slice(5)}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
                {items.length === 0 && <li className="px-1 py-6 text-center text-xs text-muted-foreground">Vacío</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </Pagina>
  );
}
