"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  FolderOpen,
  Home,
  KanbanSquare,
  LogOut,
  Menu,
  MessagesSquare,
  Moon,
  ScanSearch,
  Send,
  Settings,
  Sun,
} from "lucide-react";
import { Marca } from "@/components/marca";
import { BuscadorGlobal } from "@/components/buscador-global";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { salir } from "@/app/acciones";
import { cn } from "@/lib/utils";

type Item = { href: string; etiqueta: string; icono: React.ComponentType<{ className?: string }>; contador?: number };

export function Navegacion({
  usuario,
  contadores,
}: {
  usuario: { nombre: string; email: string };
  contadores: { cola: number; revisar: number; respondieron: number };
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const principales: Item[] = [
    { href: "/", etiqueta: "Hoy", icono: Home },
    { href: "/cola", etiqueta: "Cola", icono: Send, contador: contadores.cola },
    { href: "/conversaciones", etiqueta: "Conversaciones", icono: MessagesSquare, contador: contadores.respondieron },
    { href: "/revisar", etiqueta: "Revisar", icono: ScanSearch, contador: contadores.revisar },
  ];
  const secundarios: Item[] = [
    { href: "/empresas", etiqueta: "Empresas", icono: Building2 },
    { href: "/pipeline", etiqueta: "Pipeline", icono: KanbanSquare },
    { href: "/reuniones", etiqueta: "Reuniones", icono: CalendarCheck },
    { href: "/metricas", etiqueta: "Métricas", icono: BarChart3 },
    { href: "/materiales", etiqueta: "Materiales", icono: FolderOpen },
    { href: "/config", etiqueta: "Configuración", icono: Settings },
  ];
  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));

  const enlace = (it: Item, onClick?: () => void) => (
    <Link
      key={it.href}
      href={it.href}
      onClick={onClick}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        activo(it.href)
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      )}
    >
      <it.icono className={cn("size-[18px]", activo(it.href) && "text-sidebar-primary")} />
      <span className="flex-1">{it.etiqueta}</span>
      {!!it.contador && (
        <span className="min-w-6 rounded-full bg-sidebar-primary px-1.5 py-0.5 text-center text-[11px] font-semibold text-sidebar-primary-foreground tabular-nums">
          {it.contador > 99 ? "99+" : it.contador}
        </span>
      )}
    </Link>
  );

  const pie = (
    <div className="space-y-1 border-t border-sidebar-border pt-3">
      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      >
        <Sun className="size-[18px] dark:hidden" />
        <Moon className="hidden size-[18px] dark:block" />
        <span className="dark:hidden">Tema oscuro</span>
        <span className="hidden dark:inline">Tema claro</span>
      </button>
      <div className="flex items-center gap-3 rounded-lg px-3 py-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold uppercase text-sidebar-primary">
          {usuario.nombre.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">{usuario.nombre}</span>
          <span className="block truncate text-xs text-sidebar-foreground/50">{usuario.email}</span>
        </span>
        <form action={salir}>
          <button type="submit" title="Salir" className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar px-3 py-5 lg:flex">
        <Link href="/" className="mb-5 px-3 text-sidebar-foreground">
          <Marca />
        </Link>
        <BuscadorGlobal className="mb-4" />
        <nav className="flex flex-1 flex-col gap-1">
          {principales.map((it) => enlace(it))}
          <div className="my-3 h-px bg-sidebar-border" />
          {secundarios.map((it) => enlace(it))}
        </nav>
        {pie}
      </aside>

      {/* Celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
        <div className="grid grid-cols-5">
          {principales.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", activo(it.href) ? "text-primary" : "text-muted-foreground")}
            >
              <it.icono className="size-5" />
              {it.etiqueta === "Conversaciones" ? "Chats" : it.etiqueta}
              {!!it.contador && (
                <span className="absolute right-[22%] top-1.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {it.contador > 99 ? "99+" : it.contador}
                </span>
              )}
            </Link>
          ))}
          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground">
              <Menu className="size-5" />
              Más
            </SheetTrigger>
            <SheetContent side="bottom" className="dark rounded-t-2xl border-0 bg-sidebar px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
              <SheetHeader className="px-3">
                <SheetTitle className="text-sidebar-foreground">Más</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1">
                <BuscadorGlobal variante="item" />
                {secundarios.map((it) => enlace(it, () => setAbierto(false)))}
              </nav>
              {pie}
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
