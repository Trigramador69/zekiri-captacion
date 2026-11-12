"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { avisar } from "@/components/dialogos-contacto";
import { crearEmpresaManual } from "@/app/acciones";
import { CIUDADES, SECTORES } from "@/lib/constantes";

export function DialogoEmpresaManual() {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ empresa: "", ciudad: "SCZ", sector: SECTORES[0], telefono: "", web: "", notas: "" });
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Agregar a mano
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar empresa</DialogTitle>
          <DialogDescription>Para empresas que encontraste fuera de Google Maps (referidos, LinkedIn, ferias).</DialogDescription>
        </DialogHeader>
        <div className="grid [&>*]:min-w-0 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Nombre</Label>
            <Input autoFocus value={d.empresa} onChange={(e) => setD({ ...d, empresa: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Ciudad</Label>
            <Select value={d.ciudad} onValueChange={(v) => setD({ ...d, ciudad: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CIUDADES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sector</Label>
            <Select value={d.sector} onValueChange={(v) => setD({ ...d, sector: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTORES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Teléfono</Label>
            <Input inputMode="tel" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} placeholder="7XXXXXXX" />
          </div>
          <div className="space-y-2">
            <Label>Sitio web</Label>
            <Input value={d.web} onChange={(e) => setD({ ...d, web: e.target.value })} placeholder="https://" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Notas</Label>
            <Input value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} placeholder="Cómo la encontraste" />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!d.empresa.trim() || pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await crearEmpresaManual(d);
                if (avisar(r)) {
                  setAbierto(false);
                  setD({ ...d, empresa: "", telefono: "", web: "", notas: "" });
                  if (r.id) router.push(`/revisar?e=${encodeURIComponent(r.id)}`);
                }
              })
            }
          >
            {pendiente && <Loader2 className="animate-spin" />} Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
