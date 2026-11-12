import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleConfigurado, urlAutorizacion } from "@/lib/google";
import { crearClienteServidor } from "@/lib/supabase/server";

// Inicia la conexión con Google: pide permiso para crear eventos (con Meet) en tu Calendar.
export async function GET(request: NextRequest) {
  const origen = new URL(request.url).origin;
  if (!googleConfigurado()) return NextResponse.redirect(`${origen}/config?tab=integraciones&google=sin_configurar`);
  const sb = await crearClienteServidor();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.redirect(`${origen}/login`);
  const estado = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(urlAutorizacion(origen, estado));
  res.cookies.set("google_estado", estado, { httpOnly: true, secure: origen.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
