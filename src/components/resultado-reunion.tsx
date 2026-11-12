"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { avisar } from "@/components/dialogos-contacto";
import { registrarResultadoReunion } from "@/app/acciones";
import { cn } from "@/lib/utils";

const OPCIONES = [
  { estado: "REUNION_1_HECHA", titulo: "Se hizo", detalle: "Toca preparar la propuesta" },
  { estado: "PERDIDO", titulo: "No le interesa", detalle: "Se cierra como perdido" },
  { estado: "DESCARTADO", titulo: "No se presentó", detalle: "Se cierra; puedes reagendar después" },
];

export function ResultadoReunion({ contactoId }: { contactoId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState("REUNION_1_HECHA");
  const [nota, setNota] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">Registrar resultado</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Cómo salió la reunión?</DialogTitle>
          <DialogDescription>Queda en el historial de la empresa.</DialogDescription>
        </DialogHeader>
        <div className="grid [&>*]:min-w-0 gap-2">
          {OPCIONES.map((o) => (
            <button
              key={o.estado}
              onClick={() => setEstado(o.estado)}
              className={cn("rounded-xl border p-3 text-left text-sm", estado === o.estado ? "border-primary bg-primary/[0.07]" : "hover:bg-muted/60")}
            >
              <span className="font-medium">{o.titulo}</span>
              <span className="block text-xs text-muted-foreground">{o.detalle}</span>
            </button>
          ))}
        </div>
        <Textarea rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué necesitan, quién decide, próximos pasos…" />
        <DialogFooter>
          <Button
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                if (avisar(await registrarResultadoReunion(contactoId, estado, nota.trim()), "Resultado guardado")) setAbierto(false);
              })
            }
          >
            {pendiente && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
