import { Encabezado, Kpi, Pagina } from "@/components/comunes";
import { usuarioActual } from "@/lib/datos";
import { CIUDADES } from "@/lib/constantes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Métricas" };
export const dynamic = "force-dynamic";

type Ev = { fecha: string; estado_nuevo: string; primer_contacto: boolean; variante: string | null; ciudad: string | null; place_id: string | null; contacto_id: string | null };

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : "–");

function semanaDe(iso: string) {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/La_Paz" }));
  const dia = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function embudo(evs: Ev[]) {
  const n = (f: (e: Ev) => boolean) => evs.filter(f).length;
  const contactadas = n((e) => e.primer_contacto);
  return {
    contactadas,
    respuestas: n((e) => e.estado_nuevo === "RESPONDIO"),
    gerentes: n((e) => e.estado_nuevo === "GERENTE_CONSEGUIDO"),
    msjGerente: n((e) => e.estado_nuevo === "MSJ_GERENTE_ENVIADO"),
    reuniones: n((e) => e.estado_nuevo === "REUNION_AGENDADA"),
    hechas: n((e) => e.estado_nuevo === "REUNION_1_HECHA"),
    rechazos: n((e) => e.estado_nuevo === "NO_CONTACTAR"),
  };
}

export default async function MetricasPage() {
  const { sb } = await usuarioActual();
  const { data } = await sb.from("eventos").select("fecha, estado_nuevo, primer_contacto, variante, ciudad, place_id, contacto_id").order("fecha").limit(20000);
  const evs = (data ?? []) as Ev[];
  const total = embudo(evs);

  // Variante y ciudad se atribuyen a la empresa según su primer contacto (A/B se compara de punta a punta).
  const variantePorPlace = new Map<string, string>();
  for (const e of evs) if (e.primer_contacto && e.place_id && e.variante) variantePorPlace.set(e.place_id, e.variante);
  const porVariante = (v: string) => embudo(evs.filter((e) => e.place_id && variantePorPlace.get(e.place_id) === v));
  const A = porVariante("A");
  const B = porVariante("B");

  const semanas = [...new Set(evs.map((e) => semanaDe(e.fecha)))].sort().slice(-8);
  const filasSemana = semanas.map((s) => ({ s, ...embudo(evs.filter((e) => semanaDe(e.fecha) === s)) }));
  const maxContactadas = Math.max(1, ...filasSemana.map((f) => f.contactadas));

  const empresasPorReunion = total.reuniones ? Math.round(total.contactadas / total.reuniones) : null;
  const rechazo = total.contactadas ? total.rechazos / total.contactadas : 0;
  const listoParaEvaluar = total.contactadas >= 150 && semanas.length >= 3;
  const veredicto = !listoParaEvaluar
    ? { t: "Calibrando", d: `Se evalúa al llegar a 150 empresas y 3 semanas (van ${total.contactadas} y ${semanas.length}).`, c: "bg-muted" }
    : rechazo >= 0.1 || (empresasPorReunion ?? Infinity) > 60
      ? { t: "No funciona así", d: "Cambiar de canal o de enfoque.", c: "bg-destructive/10 text-destructive" }
      : (empresasPorReunion ?? Infinity) <= 30
        ? { t: "Funciona", d: "Escalar el volumen un 50 %.", c: "bg-success/12 text-success" }
        : { t: "Ajustar", d: "Cambiar una variable y medir una semana más.", c: "bg-warning/15" };

  return (
    <Pagina>
      <Encabezado titulo="Métricas" descripcion="Calculadas sobre el historial de eventos. La semana 1 se juzga por respuestas y gerentes, no por reuniones." />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Empresas contactadas" valor={total.contactadas} />
        <Kpi etiqueta="Tasa de respuesta" valor={pct(total.respuestas, total.contactadas)} detalle={`${total.respuestas} respuestas`} />
        <Kpi etiqueta="Derivación a gerente" valor={pct(total.gerentes, total.contactadas)} detalle={`${total.gerentes} gerentes`} />
        <Kpi etiqueta="Empresas por reunión" valor={empresasPorReunion ?? "–"} detalle={`${total.reuniones} reuniones agendadas`} />
      </section>

      <section className={cn("mb-6 flex flex-col gap-1 rounded-2xl p-5 sm:flex-row sm:items-center sm:gap-4", veredicto.c)}>
        <p className="text-lg font-semibold">{veredicto.t}</p>
        <p className="text-sm opacity-80">{veredicto.d}</p>
        <p className="text-xs opacity-70 sm:ml-auto">Rechazo explícito: {pct(total.rechazos, total.contactadas)} (límite 10 %)</p>
      </section>

      <div className="grid [&>*]:min-w-0 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="mb-4 font-semibold">Por semana</h2>
          {filasSemana.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
          ) : (
            <ul className="space-y-4">
              {filasSemana.map((f) => (
                <li key={f.s}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-medium">Semana del {f.s.slice(8)}/{f.s.slice(5, 7)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {f.contactadas} contactadas · {f.respuestas} resp. · {f.gerentes} ger. · {f.reuniones} reun.
                    </span>
                  </div>
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${(100 * f.contactadas) / maxContactadas}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="mb-1 font-semibold">Test A/B del primer mensaje</h2>
          <p className="mb-4 text-xs text-muted-foreground">De punta a punta: gerentes conseguidos ÷ empresas contactadas. Se lee al cierre de la semana 2 (≈ 35 por variante solo muestra diferencias grandes).</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Variante</th>
                <th className="pb-2 text-right font-medium">Contactadas</th>
                <th className="pb-2 text-right font-medium">Respuesta</th>
                <th className="pb-2 text-right font-medium">Gerente</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ["A · saludo en 2 pasos", A],
                ["B · presentación directa", B],
              ].map(([t, v]) => {
                const x = v as ReturnType<typeof embudo>;
                return (
                  <tr key={t as string}>
                    <td className="py-2.5">{t as string}</td>
                    <td className="py-2.5 text-right tabular-nums">{x.contactadas}</td>
                    <td className="py-2.5 text-right tabular-nums">{pct(x.respuestas, x.contactadas)}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{pct(x.gerentes, x.contactadas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border bg-card p-5 sm:p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Embudo completo</h2>
          <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Contactadas", total.contactadas, ""],
              ["Respondieron", total.respuestas, pct(total.respuestas, total.contactadas)],
              ["Gerentes", total.gerentes, pct(total.gerentes, total.contactadas)],
              ["Msj. al gerente", total.msjGerente, ""],
              ["Reuniones", total.reuniones, pct(total.reuniones, total.msjGerente) + " de msj."],
              ["Asistencia", total.hechas, pct(total.hechas, total.reuniones)],
            ].map(([k, v, d]) => (
              <div key={k as string} className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
                {d && <p className="text-xs text-muted-foreground">{d}</p>}
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {Object.entries(CIUDADES).map(([k, nombre]) => {
              const c = embudo(evs.filter((e) => e.ciudad === k));
              return (
                <div key={k} className="rounded-xl border p-4 text-sm">
                  <p className="font-medium">{nombre}</p>
                  <p className="mt-1 text-muted-foreground">
                    {c.contactadas} contactadas · {pct(c.respuestas, c.contactadas)} resp. · {c.gerentes} gerentes · {c.reuniones} reuniones
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Pagina>
  );
}
