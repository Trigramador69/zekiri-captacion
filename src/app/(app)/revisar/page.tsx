import { ScanSearch } from "lucide-react";
import { Encabezado, Pagina, Vacio } from "@/components/comunes";
import { contexto, usuarioActual } from "@/lib/datos";
import { umbrales } from "@/lib/motor";
import type { Empresa } from "@/lib/tipos";
import { CIUDADES } from "@/lib/constantes";
import { DialogoEmpresaManual } from "./empresa-manual";
import { Revision } from "./revision";

export const metadata = { title: "Revisar" };
export const dynamic = "force-dynamic";

export default async function RevisarPage({ searchParams }: { searchParams: Promise<{ ciudad?: string; e?: string }> }) {
  const { ciudad, e: abrir } = await searchParams;
  const { sb } = await usuarioActual();
  const ctx = await contexto();
  const u = umbrales(ctx);
  // Las agregadas a mano siempre se revisan, aunque su puntaje base sea bajo.
  const filtro = `puntaje_base.gte.${u.revisionBase},consulta_origen.eq.manual`;
  let q = sb.from("empresas").select("*").eq("estado_empresa", "NUEVA").or(filtro);
  if (ciudad) q = q.eq("ciudad", ciudad);
  const [{ data }, { data: todas }] = await Promise.all([
    q.order("puntaje_base", { ascending: false }).order("resenas", { ascending: false }).limit(300),
    sb.from("empresas").select("ciudad").eq("estado_empresa", "NUEVA").or(filtro),
  ]);
  const porCiudad: Record<string, number> = {};
  for (const e of todas ?? []) porCiudad[e.ciudad ?? "?"] = (porCiudad[e.ciudad ?? "?"] ?? 0) + 1;
  const empresas = (data ?? []) as Empresa[];

  return (
    <Pagina>
      <Encabezado
        titulo="Revisar empresas"
        descripcion={`Confirma que sirven, suma el puntaje de revisión y anota un dato concreto. Prioridad A desde ${u.A}, B desde ${u.B}.`}
      >
        <DialogoEmpresaManual />
      </Encabezado>
      <nav className="mb-5 flex flex-wrap gap-1.5">
        <a href="/revisar" className={`rounded-full border px-3 py-1 text-xs font-medium ${!ciudad ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
          Todas · {(todas ?? []).length}
        </a>
        {Object.entries(CIUDADES).map(([k, v]) => (
          <a
            key={k}
            href={`/revisar?ciudad=${k}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${ciudad === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
          >
            {v} · {porCiudad[k] ?? 0}
          </a>
        ))}
      </nav>
      {empresas.length === 0 ? (
        <Vacio icono={ScanSearch} titulo="No hay empresas por revisar">
          Corre una búsqueda en <a className="underline" href="/config?tab=busquedas">Configuración → Búsquedas</a> o agrega una a mano.
        </Vacio>
      ) : (
        <Revision empresas={empresas} umbrales={u} inicial={abrir} />
      )}
    </Pagina>
  );
}
