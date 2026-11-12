import { Marca } from "@/components/marca";

export const metadata = { title: "Política de privacidad", robots: { index: false, follow: false } };

/** Página pública que Google pide para publicar la conexión con Calendar. */
export default function Privacidad() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Marca className="mb-10" />
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Política de privacidad</h1>
      <p className="mb-8 text-sm text-muted-foreground">Captación Zékiri · herramienta interna de Zékiri · última actualización: noviembre de 2026</p>
      <div className="space-y-6 text-[15px] leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Qué es</h2>
          <p>
            Captación Zékiri es un sistema de uso interno de Zékiri para organizar el contacto comercial con empresas. Solo pueden entrar personas del equipo
            autorizadas por la empresa; no tiene registro abierto.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Datos de Google que usamos</h2>
          <p>
            Si una persona del equipo conecta su cuenta de Google, el sistema solo pide permiso para <strong>crear, modificar y cancelar eventos</strong> en su
            Google Calendar (incluido el enlace de Google Meet), y únicamente para las reuniones que esa persona agenda desde el sistema. No leemos otros eventos,
            correos, archivos ni contactos de la cuenta.
          </p>
          <p>
            El permiso se guarda cifrado en nuestra base de datos y solo se usa desde el servidor. La persona puede retirarlo cuando quiera desde el sistema
            (Configuración → Integraciones → Desconectar) o desde{" "}
            <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              myaccount.google.com/permissions
            </a>
            .
          </p>
          <p>
            El uso de la información recibida de las API de Google cumple la{" "}
            <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              Política de datos de usuario de los servicios de las API de Google
            </a>
            , incluidos los requisitos de uso limitado.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Datos de empresas y contactos</h2>
          <p>
            El sistema guarda datos públicos de empresas (nombre, dirección, teléfono y sitio web publicados en Google Maps) y los datos que las personas de
            contacto comparten con Zékiri durante la conversación. Se usan solo para coordinar reuniones comerciales. Quien pide no ser contactado queda en una
            lista de exclusión y no vuelve a recibir mensajes.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Con quién se comparten</h2>
          <p>No vendemos ni compartimos estos datos con terceros. Se alojan en proveedores de infraestructura (Supabase y Vercel) que los procesan por cuenta de Zékiri.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Contacto</h2>
          <p>
            Para consultas o para pedir que se borren tus datos, escribe a{" "}
            <a className="underline" href="mailto:diego.trigo@zekiri.io">
              diego.trigo@zekiri.io
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
