import { FolderOpen } from "lucide-react";
import { Encabezado, Pagina, Vacio } from "@/components/comunes";
import { usuarioActual } from "@/lib/datos";
import type { Material } from "@/lib/tipos";
import { SubirMaterial, TarjetaMaterial } from "./cliente";

export const metadata = { title: "Materiales" };
export const dynamic = "force-dynamic";

export default async function MaterialesPage() {
  const { sb } = await usuarioActual();
  const [{ data }, { data: usos }] = await Promise.all([
    sb.from("materiales").select("*").order("orden").order("creado", { ascending: false }),
    sb.from("eventos").select("material_id").not("material_id", "is", null),
  ]);
  const materiales = (data ?? []) as Material[];
  const envios: Record<string, number> = {};
  for (const u of usos ?? []) envios[u.material_id] = (envios[u.material_id] ?? 0) + 1;

  return (
    <Pagina>
      <Encabezado titulo="Materiales" descripcion="Portafolio, casos por sector y cotizaciones listos para compartir. Cada envío queda registrado en la ficha del contacto.">
        <SubirMaterial />
      </Encabezado>
      {materiales.length === 0 ? (
        <Vacio icono={FolderOpen} titulo="Todavía no hay materiales">
          Sube el portafolio y los PDF por sector. Desde la cola los agregas al mensaje con un clic.
        </Vacio>
      ) : (
        <div className="grid [&>*]:min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materiales.map((m) => (
            <TarjetaMaterial key={m.id} m={m} envios={envios[m.id] ?? 0} />
          ))}
        </div>
      )}
    </Pagina>
  );
}
