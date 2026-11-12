"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Barra fina arriba que aparece al instante al tocar un enlace interno y se va cuando la nueva pantalla llega.
 * Da respuesta inmediata sin depender de pantallas de carga con streaming.
 */
export function ProgresoNavegacion() {
  const ruta = usePathname();
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    setActivo(false);
  }, [ruta]);

  // Next cambia la URL cuando la nueva pantalla ya está lista (también con filtros ?q=…): ahí se apaga la barra.
  useEffect(() => {
    const original = { push: history.pushState, replace: history.replaceState };
    const listo = () => setActivo(false);
    history.pushState = function (...args: Parameters<History["pushState"]>) {
      const r = original.push.apply(this, args);
      listo();
      return r;
    };
    history.replaceState = function (...args: Parameters<History["replaceState"]>) {
      const r = original.replace.apply(this, args);
      listo();
      return r;
    };
    window.addEventListener("popstate", listo);
    return () => {
      history.pushState = original.push;
      history.replaceState = original.replace;
      window.removeEventListener("popstate", listo);
    };
  }, []);

  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const destino = new URL(href, location.href);
      if (destino.origin !== location.origin) return;
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      setActivo(true);
    };
    document.addEventListener("click", alClic, true);
    return () => document.removeEventListener("click", alClic, true);
  }, []);

  // Por si la navegación falla o tarda demasiado, no dejar la barra para siempre.
  useEffect(() => {
    if (!activo) return;
    const t = setTimeout(() => setActivo(false), 15000);
    return () => clearTimeout(t);
  }, [activo]);

  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-200 ${activo ? "opacity-100" : "opacity-0"}`}>
      <div className="h-full w-1/3 animate-[progreso_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>
  );
}
