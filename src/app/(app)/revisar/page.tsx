import { ScanSearch } from "lucide-react";
import { Encabezado, Pagina, Vacio } from "@/components/comunes";
import { contexto, usuarioActual } from "@/lib/datos";
import { umbrales } from "@/lib/motor";
import type { Empresa } from "@/lib/tipos";
import { CIUDADES, filtroRevisar } from "@/lib/constantes";
import { DialogoEmpresaManual } from "./empresa-manual";
import { Revision } from "./revision";

export const metadata = { title: "Revisar" };
export const dynamic = "force-dynamic";

export default async function RevisarPage({ searchParams }: { searchParams: Promise<{ ciudad?: string; e?: string; origen?: string }> }) {
  const { ciudad, e: abrir, origen } = await searchParams;
  const { sb } = await usuarioActual();
  const ctx = await contexto();
  const u = umbrales(ctx);
  // Las agregadas a mano y las de listas externas siempre se revisan, aunque su puntaje base sea bajo.
  const filtro = filtroRevisar(u.revisionBase);
  let q = sb.from("empresas").select("*").eq("estado_empresa", "NUEVA").or(filtro);
  if (ciudad) q = q.eq("ciudad", ciudad);
  if (origen === "ariel") q = q.eq("consulta_origen", "ariel");
  const [{ data }, { data: todas }] = await Promise.all([
    // Las de Ariel, en el orden de sus grupos (A, B, C); el resto, por puntaje.
    (origen === "ariel" ? q.order("place_id") : q.order("puntaje_base", { ascending: false }).order("resenas", { ascending: false })).limit(300),
    sb.from("empresas").select("ciudad, consulta_origen").eq("estado_empresa", "NUEVA").or(filtro),
  ]);
  const porCiudad: Record<string, number> = {};
  for (const e of todas ?? []) porCiudad[e.ciudad ?? "?"] = (porCiudad[e.ciudad ?? "?"] ?? 0) + 1;
  const deAriel = (todas ?? []).filter((e) => e.consulta_origen === "ariel").length;
  const empresas = (data ?? []) as Empresa[];
  const chip = (activo: boolean) => `rounded-full border px-3 py-1 text-xs font-medium ${activo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`;

  return (
    <Pagina>
      <Encabezado
        titulo="Revisar empresas"
        descripcion={`Confirma que sirven, suma el puntaje de revisión y anota un dato concreto. Prioridad A desde ${u.A}, B desde ${u.B}.`}
      >
        <DialogoEmpresaManual />
      </Encabezado>
      <nav className="mb-5 flex flex-wrap gap-1.5">
        <a href="/revisar" className={chip(!ciudad && !origen)}>
          Todas · {(todas ?? []).length}
        </a>
        {Object.entries(CIUDADES).map(([k, v]) => (
          <a key={k} href={`/revisar?ciudad=${k}`} className={chip(ciudad === k && !origen)}>
            {v} · {porCiudad[k] ?? 0}
          </a>
        ))}
        {deAriel > 0 && (
          <a href="/revisar?origen=ariel" className={chip(origen === "ariel")}>
            Lista de Ariel · {deAriel}
          </a>
        )}
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
