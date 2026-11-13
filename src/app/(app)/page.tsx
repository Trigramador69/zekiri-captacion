import { plural } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight, CalendarCheck, MessageSquareReply, ScanSearch, Send } from "lucide-react";
import { EventoBadge, Kpi, Pagina } from "@/components/comunes";
import { colaDelDia, contadores, usuarioActual } from "@/lib/datos";
import { saludoActual } from "@/lib/mensajes";
import { BotonCalendario } from "@/components/panel-reunion";

export const dynamic = "force-dynamic";

function lunesDe(fecha: string) {
  const d = new Date(`${fecha}T00:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

const fmtFechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" }).format(new Date(iso));
const fmtHace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
};

export default async function HoyPage() {
  const { sb, nombre } = await usuarioActual();
  const [cola, cont] = await Promise.all([colaDelDia(), contadores()]);
  const lunes = lunesDe(cola.hoy);
  const [semana, reuniones, actividad, respondieron] = await Promise.all([
    sb.from("eventos").select("estado_nuevo, primer_contacto").gte("fecha", `${lunes}T00:00:00-04:00`),
    sb.from("contactos").select("contacto_id, nombre, cargo, correo, telefono_e164, fecha_reunion, modalidad_reunion, responsable_reunion, enlace_reunion, evento_google_url, empresas(empresa, place_id)").eq("estado", "REUNION_AGENDADA").gte("fecha_reunion", new Date().toISOString()).order("fecha_reunion").limit(5),
    sb.from("eventos").select("id, fecha, estado_nuevo, nota, registrado_por, contacto_id, contactos(nombre, empresas(empresa))").order("fecha", { ascending: false }).limit(8),
    sb.from("contactos").select("contacto_id", { count: "exact", head: true }).eq("estado", "RESPONDIO"),
  ]);
  const ev = semana.data ?? [];
  const cuenta = (f: (e: { estado_nuevo: string; primer_contacto: boolean }) => boolean) => ev.filter(f).length;
  const s = {
    contactadas: cuenta((e) => e.primer_contacto),
    respuestas: cuenta((e) => e.estado_nuevo === "RESPONDIO" || e.estado_nuevo === "LI_CONECTADO"),
    gerentes: cuenta((e) => e.estado_nuevo === "GERENTE_CONSEGUIDO"),
    reuniones: cuenta((e) => e.estado_nuevo === "REUNION_AGENDADA"),
  };
  const siguiente = cola.items[0];
  const pendientes = cola.items.filter((i) => i.tipo === "pendiente").length;
  const fechaLarga = new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${cola.hoy}T12:00:00Z`));
  const metaSemana = 5;

  return (
    <Pagina>
      <header className="mb-8">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{fechaLarga}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {saludoActual()}, {nombre.split(" ")[0]}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {cola.feriado
            ? "Hoy no se envían mensajes nuevos. Responde a quien te escriba."
            : cola.items.length
              ? `Tienes ${plural(cola.items.length, "acción", "acciones")} en la cola${
                  pendientes ? `, ${pendientes === cola.items.length ? (pendientes === 1 ? "es" : "todas son") : pendientes === 1 ? "1 es" : `${pendientes} son`} ${pendientes === 1 ? "seguimiento o respuesta" : "seguimientos o respuestas"}` : ""
                }.`
              : "La cola está vacía. Buen momento para revisar empresas."}
          {cola.cerrados > 0 && ` Se ${cola.cerrados === 1 ? "cerró 1 contacto" : `cerraron ${cola.cerrados} contactos`} sin respuesta.`}
        </p>
      </header>

      {/* Siguiente acción */}
      {siguiente && (
        <Link
          href="/cola"
          className="group mb-6 flex items-center gap-4 rounded-2xl bg-[#0f2236] p-5 text-white shadow-lg transition-transform hover:-translate-y-0.5 sm:p-6"
        >
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-[#5fd3ef]/15 text-[#5fd3ef] sm:flex">
            <Send className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-xs font-medium uppercase tracking-[0.15em] text-[#5fd3ef]">Siguiente en la cola</span>
            <span className="mt-1 block truncate text-lg font-semibold">{siguiente.empresas?.empresa ?? siguiente.nombre}</span>
            <span className="block truncate text-sm text-white/60">{siguiente.proxima_accion}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0f2236] group-hover:bg-[#5fd3ef]">
            Empezar <ArrowRight className="size-4" />
          </span>
        </Link>
      )}

      {/* Hoy */}
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Chats nuevos hoy"
          valor={
            <>
              {cola.nuevosHoy}
              <span className="text-lg text-muted-foreground">/{cola.limite}</span>
            </>
          }
          detalle={<span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (100 * cola.nuevosHoy) / Math.max(1, cola.limite))}%` }} /></span>}
        />
        <Link href="/cola">
          <Kpi etiqueta="Seguimientos" valor={pendientes} detalle="vencen hoy o antes" className="h-full transition-colors hover:border-primary/40" />
        </Link>
        <Link href="/conversaciones">
          <Kpi etiqueta="Por responder" valor={respondieron.count ?? 0} detalle="contactos que respondieron" className="h-full transition-colors hover:border-primary/40" />
        </Link>
        <Link href="/revisar">
          <Kpi etiqueta="Por revisar" valor={cont.revisar} detalle="empresas listas para revisar" className="h-full transition-colors hover:border-primary/40" />
        </Link>
      </section>

      <div className="grid [&>*]:min-w-0 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Semana */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-semibold">Esta semana</h2>
            <Link href="/metricas" className="text-sm text-primary hover:underline">
              Ver métricas
            </Link>
          </div>
          <ol className="space-y-4">
            {[
              { k: "Empresas contactadas", v: s.contactadas, icono: Send },
              { k: "Respuestas", v: s.respuestas, icono: MessageSquareReply },
              { k: "Gerentes conseguidos", v: s.gerentes, icono: ScanSearch },
              { k: "Reuniones agendadas", v: s.reuniones, icono: CalendarCheck, meta: metaSemana },
            ].map((f, i, arr) => {
              const max = Math.max(1, arr[0].v);
              return (
                <li key={f.k} className="flex items-center gap-4">
                  <f.icono className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span>{f.k}</span>
                      <span className="font-semibold tabular-nums">
                        {f.v}
                        {f.meta ? <span className="font-normal text-muted-foreground"> / meta {f.meta}–10</span> : ""}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(f.v ? 4 : 0, (100 * f.v) / max)}%`, opacity: 1 - i * 0.15 }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Reuniones */}
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">Próximas reuniones</h2>
            <Link href="/reuniones" className="text-sm text-primary hover:underline">
              Todas
            </Link>
          </div>
          {(reuniones.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay reuniones agendadas. ¡Vamos por la primera!</p>
          ) : (
            <ul className="space-y-3">
              {(reuniones.data ?? []).map((r) => {
                const emp = r.empresas as unknown as { empresa: string; place_id: string } | null;
                return (
                  <li key={r.contacto_id} className="flex items-center gap-1">
                    <Link href={`/conversaciones?c=${r.contacto_id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 hover:bg-muted/60">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
                        <CalendarCheck className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{emp?.empresa}</span>
                        <span className="block text-xs text-muted-foreground first-letter:uppercase">
                          {r.fecha_reunion && fmtFechaHora(r.fecha_reunion)} · {r.modalidad_reunion} · {r.responsable_reunion}
                        </span>
                      </span>
                    </Link>
                    <BotonCalendario r={{ ...r, empresa: emp?.empresa }} className="shrink-0" soloIcono />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Actividad */}
      <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">Actividad reciente</h2>
        {(actividad.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aquí verás cada envío, respuesta y cambio de estado.</p>
        ) : (
          <ul className="divide-y">
            {(actividad.data ?? []).map((a) => {
              const c = a.contactos as unknown as { nombre: string | null; empresas: { empresa: string } | null } | null;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <EventoBadge evento={a.estado_nuevo} />
                  <Link href={a.contacto_id ? `/conversaciones?c=${a.contacto_id}` : "/conversaciones"} className="min-w-0 flex-1 truncate hover:underline">
                    {c?.empresas?.empresa ?? c?.nombre ?? a.contacto_id}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {a.registrado_por} · {fmtHace(a.fecha)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Pagina>
  );
}
