import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { Encabezado, EstadoBadge, Pagina, Vacio } from "@/components/comunes";
import { usuarioActual } from "@/lib/datos";
import type { ContactoConEmpresa } from "@/lib/tipos";
import { ResultadoReunion } from "@/components/resultado-reunion";
import { PanelReunion } from "@/components/panel-reunion";

export const metadata = { title: "Reuniones" };
export const dynamic = "force-dynamic";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(iso));

export default async function ReunionesPage() {
  const { sb, nombre } = await usuarioActual();
  const { data } = await sb
    .from("contactos")
    .select("*, empresas(*)")
    .not("fecha_reunion", "is", null)
    .order("fecha_reunion", { ascending: true });
  const todas = (data ?? []) as ContactoConEmpresa[];
  const { data: perfiles } = await sb.from("perfiles").select("nombre");
  const responsables = [...new Set([nombre, ...(perfiles ?? []).map((p) => p.nombre)].filter(Boolean))];
  const ahora = new Date().toISOString();
  const proximas = todas.filter((c) => c.estado === "REUNION_AGENDADA" && (c.fecha_reunion ?? "") >= ahora);
  const porRegistrar = todas.filter((c) => c.estado === "REUNION_AGENDADA" && (c.fecha_reunion ?? "") < ahora);
  const pasadas = todas.filter((c) => c.estado !== "REUNION_AGENDADA").reverse();

  const tarjeta = (c: ContactoConEmpresa, conResultado = false) => (
    <li key={c.contacto_id} className="space-y-3 rounded-2xl border bg-card p-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-success/12 text-success">
        <span className="text-[10px] font-semibold uppercase leading-none">
          {new Intl.DateTimeFormat("es-BO", { month: "short", timeZone: "America/La_Paz" }).format(new Date(c.fecha_reunion!))}
        </span>
        <span className="text-lg font-semibold leading-none">{new Intl.DateTimeFormat("es-BO", { day: "numeric", timeZone: "America/La_Paz" }).format(new Date(c.fecha_reunion!))}</span>
      </span>
      <div className="min-w-0 flex-1">
        <Link href={c.empresas ? `/empresas/${encodeURIComponent(c.empresas.place_id)}` : "#"} className="font-medium hover:underline">
          {c.empresas?.empresa}
        </Link>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {fmt(c.fecha_reunion!)} · {c.modalidad_reunion} · {c.nombre}
          {c.cargo ? ` (${c.cargo})` : ""}
        </p>
        <p className="text-xs text-muted-foreground">Responsable: {c.responsable_reunion ?? "-"}</p>
        {c.resultado && <p className="mt-1 text-sm">{c.resultado}</p>}
      </div>
      {conResultado ? <ResultadoReunion contactoId={c.contacto_id} /> : <EstadoBadge estado={c.estado} />}
    </div>
    {c.estado === "REUNION_AGENDADA" && !conResultado && <PanelReunion r={{ ...c, empresa: c.empresas?.empresa }} responsables={responsables} compacto />}
    </li>
  );

  return (
    <Pagina>
      <Encabezado titulo="Reuniones" descripcion={`${proximas.length} próximas · ${pasadas.length} realizadas o cerradas`} />
      {todas.length === 0 ? (
        <Vacio icono={CalendarCheck} titulo="Todavía no hay reuniones">
          Cuando agendes una desde la cola, aparece aquí con su ficha de traspaso.
        </Vacio>
      ) : (
        <div className="space-y-8">
          {porRegistrar.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-warning-foreground dark:text-warning">Registrar resultado</h2>
              <ul className="space-y-3">{porRegistrar.map((c) => tarjeta(c, true))}</ul>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Próximas</h2>
            {proximas.length ? <ul className="space-y-3">{proximas.map((c) => tarjeta(c))}</ul> : <p className="text-sm text-muted-foreground">Ninguna agendada.</p>}
          </section>
          {pasadas.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Historial</h2>
              <ul className="space-y-3">{pasadas.map((c) => tarjeta(c))}</ul>
            </section>
          )}
        </div>
      )}
    </Pagina>
  );
}
