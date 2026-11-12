// Carga los datos iniciales: configuración, plantillas, feriados y búsquedas (desde la planilla),
// y opcionalmente las empresas de un CSV de Places (sistema/salida/empresas_<fecha>.csv).
// Uso:
//   npm run db:sembrar
//   npm run db:sembrar -- --empresas ../sistema/salida/empresas_2026-11-10.csv
// No pisa lo que ya editaste: config y plantillas solo se insertan si no existen (usa --forzar para reemplazar).
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}
const sb = createClient(url, secret, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const forzar = args.includes("--forzar");
const iEmp = args.indexOf("--empresas");
const csvEmpresas = iEmp >= 0 ? args[iEmp + 1] : null;

const datos = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", "supabase", "datos_iniciales.json"), "utf8"));

async function upsert(tabla, filas, onConflict) {
  if (!filas.length) return;
  const { error } = await sb.from(tabla).upsert(filas, { onConflict, ignoreDuplicates: !forzar });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  console.log(`✓ ${tabla}: ${filas.length}`);
}

const config = datos.config.map((c) => ({ clave: c.clave, valor: c.valor == null ? "" : String(c.valor), nota: c.nota ?? null }));
if (!config.some((c) => c.clave === "fecha_inicio")) config.push({ clave: "fecha_inicio", valor: "2026-11-09", nota: "Primer día de envíos (define semana 1 y semana 2)" });
await upsert("config", config, "clave");
await upsert(
  "plantillas",
  datos.plantillas.map((p) => ({ id: p.id, rol: p.rol ?? null, canal: p.canal ?? null, variante: p.variante ?? null, texto: p.texto, notas: p.notas ?? null })),
  "id"
);
await upsert(
  "feriados",
  datos.feriados.map((f) => ({ fecha: f.fecha, nombre: f.nombre, ambito: f.ambito || "nacional", verificado: f.verificado === "SI" })),
  "fecha,ambito"
);
await upsert(
  "consultas",
  datos.consultas.map((c) => ({ id: c.id, ciudad: c.ciudad, zona: c.zona ?? null, sector: c.sector ?? null, termino: c.termino, activa: c.activa !== "NO" })),
  "id"
);

if (csvEmpresas) {
  const texto = fs.readFileSync(path.resolve(csvEmpresas), "utf8").replace(/^﻿/, "");
  const filas = [];
  let r = [], f = "", q = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (q) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { r.push(f); f = ""; }
    else if (ch === "\n") { r.push(f); filas.push(r); r = []; f = ""; }
    else if (ch !== "\r") f += ch;
  }
  if (f || r.length) { r.push(f); filas.push(r); }
  const [h, ...resto] = filas.filter((x) => x.length > 1);
  const empresas = resto.map((x) => {
    const o = Object.fromEntries(h.map((k, i) => [k, x[i] ?? ""]));
    const [baseTxt, ...dir] = String(o.notas || "").split(" | ");
    const sucursalDe = baseTxt.startsWith("Sucursal de") ? baseTxt.replace(/\s*\(.*$/, "") : null;
    return {
      place_id: o.place_id,
      empresa: o.empresa,
      ciudad: o.ciudad || null,
      zona: o.zona || null,
      sector: o.sector || null,
      consulta_origen: o.consulta_origen || null,
      direccion: (sucursalDe ? dir.slice(1) : dir).join(" | ") || null,
      tel_publico: o.tel_publico || null,
      tel_tipo: o.tel_tipo || "sin_telefono",
      web: o.web || null,
      resenas: Number(o.resenas) || 0,
      sucursales: Number(o.sucursales) || 1,
      puntaje_base: o.puntaje_base === "" ? null : Number(o.puntaje_base),
      puntaje_detalle: (sucursalDe ? dir[0] : baseTxt).replace(/^base:\s*/, "").replace(/;\s*/g, " · ") || null,
      estado_empresa: o.estado_empresa || "NUEVA",
      motivo_descarte: sucursalDe,
      canal_inicial: o.canal_inicial || null,
      fecha_alta: o.fecha_alta || undefined,
    };
  });
  for (let i = 0; i < empresas.length; i += 200) {
    const { error } = await sb.from("empresas").upsert(empresas.slice(i, i + 200), { onConflict: "place_id", ignoreDuplicates: true });
    if (error) throw new Error(`empresas: ${error.message}`);
  }
  console.log(`✓ empresas: ${empresas.length} (las que ya existían no se tocaron)`);
}
console.log("Listo.");
