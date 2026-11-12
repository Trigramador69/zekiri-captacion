import { Encabezado, Pagina } from "@/components/comunes";
import { usuarioActual } from "@/lib/datos";
import type { Plantilla } from "@/lib/tipos";
import { ConfigTabs } from "./cliente";
import { googleConfigurado } from "@/lib/google";
import { remitente, smtpConfigurado } from "@/lib/correo";

export const metadata = { title: "Configuración" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function ConfigPage({ searchParams }: { searchParams: Promise<{ tab?: string; google?: string }> }) {
  const { tab, google } = await searchParams;
  const { sb, user } = await usuarioActual();
  const [config, plantillas, consultas, exclusion, perfiles, feriados, conexion, ultima] = await Promise.all([
    sb.from("config").select("*").order("clave"),
    sb.from("plantillas").select("*").order("id"),
    sb.from("consultas").select("*").order("id"),
    sb.from("exclusion").select("*").order("fecha", { ascending: false }).limit(200),
    sb.from("perfiles").select("id, nombre, rol, creado").order("creado"),
    sb.from("feriados").select("*").order("fecha"),
    sb.from("google_conexiones").select("email, actualizado").eq("user_id", user.id).maybeSingle(),
    sb.from("avisos_enviados").select("enviado, detalle").eq("clave", "ultima_ejecucion").maybeSingle(),
  ]);
  return (
    <Pagina>
      <Encabezado titulo="Configuración" descripcion="Datos que usan los mensajes, plantillas, búsquedas en Google, lista de exclusión y usuarios." />
      <ConfigTabs
        tab={tab ?? "general"}
        config={config.data ?? []}
        plantillas={(plantillas.data ?? []) as Plantilla[]}
        consultas={consultas.data ?? []}
        exclusion={exclusion.data ?? []}
        perfiles={perfiles.data ?? []}
        feriados={feriados.data ?? []}
        placesConfigurado={Boolean(process.env.PLACES_API_KEY)}
        integraciones={{
          configurado: googleConfigurado(),
          correo: smtpConfigurado() ? remitente() : null,
          conexion: conexion.data ?? null,
          ultimaEjecucion: ultima.data ?? null,
          estadoUrl: google,
        }}
      />
    </Pagina>
  );
}
