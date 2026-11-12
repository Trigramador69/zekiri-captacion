import { Navegacion } from "@/components/navegacion";
import { PostReunionHost } from "@/components/post-reunion";
import { ProgresoNavegacion } from "@/components/progreso-navegacion";
import { contadores, usuarioActual } from "@/lib/datos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil, nombre } = await usuarioActual();
  if (!perfil) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-xl font-semibold">Sin acceso</h1>
          <p className="text-sm text-muted-foreground">Tu usuario existe pero no tiene perfil en el sistema. Pide al administrador que te agregue.</p>
        </div>
      </main>
    );
  }
  const c = await contadores();
  return (
    <div className="min-h-dvh">
      <Navegacion usuario={{ nombre, email: user.email ?? "" }} contadores={c} />
      <div className="pb-24 lg:pb-0 lg:pl-60">{children}</div>
      <PostReunionHost />
      <ProgresoNavegacion />
    </div>
  );
}
