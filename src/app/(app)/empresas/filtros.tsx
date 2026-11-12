"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CIUDADES, ESTADOS_EMPRESA } from "@/lib/constantes";

export function FiltrosEmpresas({ q, estado, ciudad }: { q?: string; estado?: string; ciudad?: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const [texto, setTexto] = useState(q ?? "");

  const ir = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const todo = { q: texto || undefined, estado, ciudad, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v) p.set(k, v);
    router.replace(`${ruta}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  // Busca mientras escribes (con una pequeña espera).
  useEffect(() => {
    if (texto === (q ?? "")) return;
    const t = setTimeout(() => ir({ q: texto || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o teléfono…" className="h-10 pl-9" />
      </div>
      <Select value={estado ?? "activas"} onValueChange={(v) => ir({ estado: v === "activas" ? undefined : v })}>
        <SelectTrigger className="h-10 w-full sm:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="activas">Todas menos descartadas</SelectItem>
          {Object.entries(ESTADOS_EMPRESA).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
          <SelectItem value="todas">Todas</SelectItem>
        </SelectContent>
      </Select>
      <Select value={ciudad ?? "todas"} onValueChange={(v) => ir({ ciudad: v === "todas" ? undefined : v })}>
        <SelectTrigger className="h-10 w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas las ciudades</SelectItem>
          {Object.entries(CIUDADES).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
