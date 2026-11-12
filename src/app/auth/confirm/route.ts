import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Enlace del correo: /auth/confirm?token_hash=...&type=email (o ?code=... en flujo PKCE)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const sb = await crearClienteServidor();
  let ok = false;
  if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  else if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  return NextResponse.redirect(ok ? `${origin}/` : `${origin}/login?error=enlace`);
}
