"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function enviarCodigo(email: string) {
  const sb = await crearClienteServidor();
  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false, emailRedirectTo: `${origen}/auth/confirm` },
  });
  if (error) {
    const msg = /not allowed|signups not allowed|user not found/i.test(error.message)
      ? "Ese correo no tiene acceso. Pide que te inviten."
      : /rate|seconds/i.test(error.message)
        ? "Espera un momento antes de pedir otro código."
        : error.message;
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function verificarCodigo(email: string, codigo: string) {
  const sb = await crearClienteServidor();
  const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: codigo.replace(/\D/g, ""), type: "email" });
  if (error) return { ok: false, error: "El código no es válido o ya venció. Pide otro." };
  redirect("/");
}
