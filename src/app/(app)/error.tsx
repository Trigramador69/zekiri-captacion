"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPantalla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const sinConexion = /fetch|network|Failed to fetch/i.test(error.message);
  return (
    <main className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" />
        </span>
        <h1 className="text-xl font-semibold">{sinConexion ? "Sin conexión con el servidor" : "Algo salió mal en esta pantalla"}</h1>
        <p className="text-sm text-muted-foreground">
          {sinConexion
            ? "Revisa tu conexión a internet y vuelve a intentar."
            : "Vuelve a intentar. Si se repite, anota qué estabas haciendo y avisa al administrador."}
        </p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">Código: {error.digest}</p>}
        <Button onClick={reset}>
          <RotateCcw /> Volver a intentar
        </Button>
      </div>
    </main>
  );
}
