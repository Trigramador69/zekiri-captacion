import { Marca } from "@/components/marca";
import { FormularioLogin } from "./formulario";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0f2236] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-32 -top-32 size-[480px] rounded-full bg-[#5fd3ef]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-10 size-[420px] rounded-full bg-[#2f7fd6]/20 blur-3xl" />
        <Marca className="relative text-white" />
        <div className="relative max-w-md space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#5fd3ef]">Uso interno</p>
          <h1 className="text-4xl font-semibold leading-tight text-balance">De la búsqueda a la reunión, en un solo lugar.</h1>
          <p className="text-base text-white/70">
            Empresas, mensajes listos para enviar, seguimientos a tiempo y métricas del embudo. El envío sigue siendo tuyo, uno a uno.
          </p>
        </div>
        <p className="relative text-xs text-white/40">Zékiri · Santa Cruz · La Paz · Cochabamba</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <Marca className="lg:hidden" />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
            <p className="text-sm text-muted-foreground">Te enviamos un enlace a tu correo para entrar sin contraseña. Solo entran correos autorizados.</p>
          </div>
          {error === "enlace" && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">El enlace venció o ya se usó. Pide uno nuevo.</p>
          )}
          <FormularioLogin />
        </div>
      </section>
    </main>
  );
}
