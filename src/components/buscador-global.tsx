"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, MessagesSquare, Search } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { EstadoBadge, EstadoEmpresaBadge } from "@/components/comunes";
import { buscar, type ResultadoBusqueda } from "@/app/acciones";
import { telLegible } from "@/lib/mensajes";
import { cn } from "@/lib/utils";

const ACTIVOS = new Set(["LISTO", "SALUDO_ENVIADO", "MSJ_LARGO_ENVIADO", "RESPONDIO", "MSJ_GERENTE_ENVIADO", "LI_INVITACION_ENVIADA", "LI_CONECTADO", "LI_MSJ_ENVIADO", "REUNION_AGENDADA", "REUNION_1_HECHA", "PROPUESTA_ENVIADA", "REUNION_2"]);

/** Buscador de contactos y empresas por nombre o celular (Ctrl+K). */
export function BuscadorGlobal({ className, variante = "barra" }: { className?: string; variante?: "barra" | "item" }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ResultadoBusqueda>({ contactos: [], empresas: [] });
  const [cargando, setCargando] = useState(false);
  const ultimo = useRef(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes({ contactos: [], empresas: [] });
      return;
    }
    const id = ++ultimo.current;
    setCargando(true);
    const t = setTimeout(async () => {
      const r = await buscar(q);
      if (id === ultimo.current) {
        setRes(r);
        setCargando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const ir = (url: string) => {
    setAbierto(false);
    setQ("");
    router.push(url);
  };

  return (
    <>
      {variante === "barra" ? (
        <button
          onClick={() => setAbierto(true)}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            className
          )}
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Buscar…</span>
          <kbd className="rounded border border-sidebar-border px-1.5 text-[10px]">Ctrl K</kbd>
        </button>
      ) : (
        <button
          onClick={() => setAbierto(true)}
          className={cn("flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60", className)}
        >
          <Search className="size-[18px]" /> Buscar contacto o empresa
        </button>
      )}
      <CommandDialog open={abierto} onOpenChange={setAbierto} title="Buscar" description="Contactos y empresas por nombre o celular">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Nombre, empresa o celular (ej. 7212…)" />
          <CommandList className="max-h-[60vh]">
            {q.trim().length >= 2 && !cargando && <CommandEmpty>Sin resultados.</CommandEmpty>}
            {cargando && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Buscando…
              </div>
            )}
            {res.contactos.length > 0 && (
              <CommandGroup heading="Contactos">
                {res.contactos.map((c) => (
                  <CommandItem
                    key={c.contacto_id}
                    value={`c-${c.contacto_id}`}
                    onSelect={() => ir(ACTIVOS.has(c.estado) ? `/conversaciones?c=${c.contacto_id}` : `/empresas?q=${encodeURIComponent(c.empresa ?? c.nombre ?? "")}`)}
                  >
                    <MessagesSquare />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.empresa ?? c.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.rol_contacto === "gerente" ? c.nombre ?? "Gerente" : "Recepción"}
                        {c.telefono_e164 ? ` · ${telLegible(c.telefono_e164)}` : ""}
                      </span>
                    </span>
                    <EstadoBadge estado={c.estado} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {res.empresas.length > 0 && (
              <CommandGroup heading="Empresas">
                {res.empresas.map((e) => (
                  <CommandItem key={e.place_id} value={`e-${e.place_id}`} onSelect={() => ir(`/empresas/${encodeURIComponent(e.place_id)}`)}>
                    <Building2 />
                    <span className="min-w-0 flex-1 truncate">{e.empresa}</span>
                    <span className="text-xs text-muted-foreground">{e.ciudad}</span>
                    <EstadoEmpresaBadge estado={e.estado_empresa} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
