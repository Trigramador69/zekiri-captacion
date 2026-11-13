"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, FileText, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { avisar } from "@/components/dialogos-contacto";
import { crearMaterial, eliminarMaterial } from "@/app/acciones";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { SECTORES } from "@/lib/constantes";
import type { Material } from "@/lib/tipos";

const mb = (b: number | null) => (b ? `${(b / 1e6).toFixed(1)} MB` : "");

export function TarjetaMaterial({ m, envios }: { m: Material; envios: number }) {
  const [pendiente, iniciar] = useTransition();
  const pesado = (m.peso_bytes ?? 0) > 8e6;
  return (
    <article className="flex flex-col rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {m.tipo === "enlace" ? <Link2 className="size-5" /> : <FileText className="size-5" />}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{m.titulo}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[m.sector, mb(m.peso_bytes), envios ? `${envios} envíos` : "sin envíos"].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {m.descripcion && <p className="mb-4 text-sm text-muted-foreground">{m.descripcion}</p>}
      {pesado && <p className="mb-4 rounded-lg bg-warning/10 px-3 py-2 text-xs">Pesa más de 8 MB: en WhatsApp conviene mandar el enlace, no el archivo.</p>}
      <div className="mt-auto flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => m.url && navigator.clipboard?.writeText(m.url).then(() => toast.success("Enlace copiado"))}>
          <Copy /> Copiar enlace
        </Button>
        <Button size="icon" variant="outline" asChild title="Abrir">
          <a href={m.url ?? "#"} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
          </a>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Eliminar"
          disabled={pendiente}
          onClick={() => {
            if (window.confirm(`¿Eliminar «${m.titulo}»? Los enlaces ya enviados dejarán de funcionar.`)) iniciar(async () => void avisar(await eliminarMaterial(m.id), "Eliminado"));
          }}
        >
          {pendiente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
    </article>
  );
}

export function SubirMaterial() {
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState({ titulo: "", descripcion: "", sector: "General", url: "" });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const guardar = async () => {
    setSubiendo(true);
    try {
      let url = d.url.trim();
      let ruta: string | undefined;
      if (archivo) {
        const sb = crearClienteNavegador();
        const limpio = archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
        ruta = `${crypto.randomUUID().slice(0, 8)}/${limpio}`;
        const { error } = await sb.storage.from("materiales").upload(ruta, archivo, { contentType: archivo.type || "application/pdf", upsert: false });
        if (error) throw new Error(error.message);
        url = sb.storage.from("materiales").getPublicUrl(ruta).data.publicUrl;
      }
      const ok = avisar(
        await crearMaterial({
          titulo: d.titulo.trim(),
          descripcion: d.descripcion.trim() || undefined,
          sector: d.sector === "General" ? undefined : d.sector,
          tipo: archivo ? "pdf" : "enlace",
          archivo: ruta,
          url,
          peso_bytes: archivo?.size,
        })
      );
      if (ok) {
        setAbierto(false);
        setArchivo(null);
        setD({ titulo: "", descripcion: "", sector: "General", url: "" });
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(
        /failed to fetch|networkerror|load failed/i.test(m)
          ? "No se pudo conectar con el almacenamiento. Revisa tu conexión o pausa el bloqueador de anuncios en esta página y vuelve a intentar."
          : m || "No se pudo subir",
        { duration: 10000 }
      );
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button>
          <Upload /> Subir material
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo material</DialogTitle>
          <DialogDescription>Sube un PDF (hasta 50 MB) o pega un enlace. El enlace es público para quien lo reciba.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm hover:bg-muted/50"
          >
            <Upload className="size-6 text-muted-foreground" />
            {archivo ? (
              <span className="font-medium">
                {archivo.name} · {mb(archivo.size)}
              </span>
            ) : (
              <span className="text-muted-foreground">Elegir archivo PDF</span>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setArchivo(f);
              if (f && !d.titulo) setD((x) => ({ ...x, titulo: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") }));
            }}
          />
          {!archivo && (
            <div className="space-y-2">
              <Label>…o enlace</Label>
              <Input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="https://zekiri.io/…" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} placeholder="Portafolio — Distribución" />
          </div>
          <div className="grid [&>*]:min-w-0 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Sector</Label>
              <Select value={d.sector} onValueChange={(v) => setD({ ...d, sector: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["General", ...SECTORES].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} placeholder="Cuándo usarlo" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!d.titulo.trim() || (!archivo && !d.url.trim()) || subiendo} onClick={guardar}>
            {subiendo && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
