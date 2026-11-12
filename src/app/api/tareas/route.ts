import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/server";
import { ejecutarTareas } from "@/lib/tareas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** n8n llama aquí cada 15 minutos con `Authorization: Bearer <TAREAS_SECRETO>`. */
export async function POST(request: NextRequest) {
  const secreto = process.env.TAREAS_SECRETO ?? "";
  const recibido = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secreto.length >= 16 && recibido.length === secreto.length && crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto));
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const r = await ejecutarTareas(crearClienteAdmin(), { appUrl: new URL(request.url).origin });
    return NextResponse.json(r, { status: r.errores.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
