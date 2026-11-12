import { NextResponse, type NextRequest } from "next/server";
import { canjearCodigo, cifrar } from "@/lib/google";
import { crearClienteServidor } from "@/lib/supabase/server";

// Google vuelve aquí con el código: se canjea por el permiso permanente y se guarda cifrado.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origen = url.origin;
  const volver = (estado: string) => {
    const r = NextResponse.redirect(`${origen}/config?tab=integraciones&google=${estado}`);
    r.cookies.delete("google_estado");
    return r;
  };
  if (url.searchParams.get("error")) return volver("cancelado");
  const code = url.searchParams.get("code");
  const estado = url.searchParams.get("state");
  if (!code || !estado || estado !== request.cookies.get("google_estado")?.value) return volver("error");

  const sb = await crearClienteServidor();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.redirect(`${origen}/login`);
  try {
    const t = await canjearCodigo(origen, code);
    const { error } = await sb.from("google_conexiones").upsert({
      user_id: userId,
      email: t.email,
      refresh_token_cifrado: cifrar(t.refresh),
      scopes: t.scopes,
      actualizado: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    if (!t.scopes.includes("calendar.events")) return volver("permisos_incompletos");
    return volver("ok");
  } catch (e) {
    console.error("Conexión con Google:", e);
    return volver("error");
  }
}
