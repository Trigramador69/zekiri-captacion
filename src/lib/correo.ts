import "server-only";
import nodemailer from "nodemailer";

/*
 * Avisos por correo desde la cuenta de Zoho de Zékiri (SMTP con contraseña de aplicación).
 * Variables: SMTP_USER y SMTP_PASS (obligatorias); SMTP_HOST (smtp.zoho.com) y SMTP_PORT (465) opcionales.
 * SMTP_FROM opcional: remitente cuando el usuario SMTP no es un correo (por ejemplo Resend, usuario "resend").
 */

export function smtpConfigurado() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function remitente() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "";
}

let transporte: ReturnType<typeof nodemailer.createTransport> | null = null;

function obtenerTransporte() {
  if (!smtpConfigurado()) throw new Error("Falta configurar el correo (SMTP_USER y SMTP_PASS) en el servidor.");
  if (!transporte) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.zoho.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporte;
}

export async function enviarCorreo({ para, asunto, html }: { para: string; asunto: string; html: string }) {
  await obtenerTransporte().sendMail({
    from: { name: "Captación Zékiri", address: remitente() },
    to: para,
    subject: asunto,
    html,
  });
}
