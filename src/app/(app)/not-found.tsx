import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <SearchX className="size-6" />
        </span>
        <h1 className="text-xl font-semibold">No encontramos esa página</h1>
        <p className="text-sm text-muted-foreground">Puede que la empresa se haya eliminado o que el enlace esté mal. Usa el buscador (Ctrl K) para encontrarla.</p>
        <Button asChild>
          <Link href="/">Ir a Hoy</Link>
        </Button>
      </div>
    </main>
  );
}
