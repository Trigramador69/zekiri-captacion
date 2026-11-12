"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enviarCodigo, verificarCodigo } from "./acciones";

export function FormularioLogin() {
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [paso, setPaso] = useState<"correo" | "codigo">("correo");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const pedir = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await enviarCodigo(email);
      if (r.ok) setPaso("codigo");
      else setError(r.error ?? "No se pudo enviar el código");
    });
  };

  const verificar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await verificarCodigo(email, codigo);
      if (r && !r.ok) setError(r.error ?? "Código inválido");
    });
  };

  if (paso === "codigo") {
    return (
      <form onSubmit={verificar} className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Te enviamos un enlace a <strong>{email}</strong>. Ábrelo <strong>en este mismo navegador</strong> (si lo abres desde la app de correo del celular,
            mantén presionado y elige «Abrir en Chrome»).
          </p>
        </div>
        <details className="group rounded-xl border p-4 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">¿Te llegó un código de 6 dígitos?</summary>
          <div className="mt-4 space-y-3">
            <Label htmlFor="codigo">Código</Label>
            <Input
              id="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="123456"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
            />
            <Button type="submit" className="h-10 w-full" disabled={pendiente || codigo.replace(/\D/g, "").length < 6}>
              {pendiente && <Loader2 className="animate-spin" />} Entrar con el código
            </Button>
          </div>
        </details>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="ghost" className="w-full" onClick={() => setPaso("correo")}>
          <ArrowLeft /> Usar otro correo o reenviar
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={pedir} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pendiente || !email}>
        {pendiente && <Loader2 className="animate-spin" />} Enviarme el enlace
      </Button>
    </form>
  );
}
