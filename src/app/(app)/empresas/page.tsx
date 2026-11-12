import Link from "next/link";
import { Building2 } from "lucide-react";
import { Encabezado, EstadoEmpresaBadge, Pagina, Prioridad, Vacio } from "@/components/comunes";
import { contexto, usuarioActual } from "@/lib/datos";
import { prioridadDe } from "@/lib/motor";
import type { Empresa } from "@/lib/tipos";
import { FiltrosEmpresas } from "./filtros";

export const metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; ciudad?: string; p?: string }> }) {
  const sp = await searchParams;
  const { sb } = await usuarioActual();
  const ctx = await contexto();
  const pagina = Math.max(1, Number(sp.p) || 1);
  let q = sb.from("empresas").select("*", { count: "exact" });
  if (sp.q) q = q.or(`empresa.ilike.%${sp.q.replace(/[%,()]/g, " ")}%,tel_publico.ilike.%${sp.q.replace(/[%,()]/g, " ")}%`);
  if (!sp.estado) q = q.neq("estado_empresa", "DESCARTADA");
  else if (sp.estado !== "todas") q = q.eq("estado_empresa", sp.estado);
  if (sp.ciudad) q = q.eq("ciudad", sp.ciudad);
  const { data, count } = await q
    .order("actualizado", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  const empresas = (data ?? []) as Empresa[];
  const total = count ?? 0;
  const url = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const todo = { q: sp.q, estado: sp.estado, ciudad: sp.ciudad, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v) p.set(k, v);
    const s = p.toString();
    return `/empresas${s ? `?${s}` : ""}`;
  };
  return (
    <Pagina>
      <Encabezado titulo="Empresas" descripcion={`${total} empresas${sp.estado || sp.ciudad || sp.q ? " con estos filtros" : " (sin contar descartadas)"}`} />
      <FiltrosEmpresas key={`${sp.q ?? ""}|${sp.estado ?? ""}|${sp.ciudad ?? ""}`} q={sp.q} estado={sp.estado} ciudad={sp.ciudad} />

      {empresas.length === 0 ? (
        <Vacio icono={Building2} titulo="Sin resultados">
          Prueba con otro nombre o quita los filtros.
        </Vacio>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Sector</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Ciudad</th>
                <th className="px-4 py-3 text-center font-medium">Puntaje</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {empresas.map((e) => (
                <tr key={e.place_id} className="group relative cursor-pointer hover:bg-muted/40">
                  <td className="max-w-0 px-4 py-3">
                    <Link href={`/empresas/${encodeURIComponent(e.place_id)}`} className="block truncate font-medium after:absolute after:inset-0 group-hover:text-primary">
                      {e.empresa}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">{e.tel_publico ?? "sin teléfono"} · {e.resenas} reseñas</span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{e.sector}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{e.ciudad}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center justify-center gap-2">
                      <span className="tabular-nums">{e.puntaje_final}</span>
                      <Prioridad valor={e.puntaje_revision != null ? prioridadDe(e, ctx) : ""} />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <EstadoEmpresaBadge estado={e.estado_empresa} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > POR_PAGINA && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {pagina} de {Math.ceil(total / POR_PAGINA)}
          </span>
          <span className="flex gap-2">
            {pagina > 1 && (
              <Link className="rounded-lg border px-3 py-1.5 hover:bg-muted" href={url({ p: String(pagina - 1) })}>
                Anterior
              </Link>
            )}
            {pagina * POR_PAGINA < total && (
              <Link className="rounded-lg border px-3 py-1.5 hover:bg-muted" href={url({ p: String(pagina + 1) })}>
                Siguiente
              </Link>
            )}
          </span>
        </nav>
      )}
    </Pagina>
  );
}
