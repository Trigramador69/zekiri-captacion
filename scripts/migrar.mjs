// Aplica las migraciones de supabase/migrations en orden (una sola vez cada una).
// Uso: npm run db:migrar   (lee SUPABASE_DB_URL de .env.local)
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Falta SUPABASE_DB_URL en .env.local (Supabase → Project Settings → Database → Connection string → Session pooler).");
  process.exit(1);
}
const dir = path.resolve(import.meta.dirname, "..", "supabase", "migrations");
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await cliente.connect();
try {
  await cliente.query("create table if not exists public._migraciones (nombre text primary key, aplicada timestamptz not null default now())");
  await cliente.query("alter table public._migraciones enable row level security");
  const { rows } = await cliente.query("select nombre from public._migraciones");
  const hechas = new Set(rows.map((r) => r.nombre));
  for (const f of archivos) {
    if (hechas.has(f)) {
      console.log(`= ${f} (ya aplicada)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await cliente.query("begin");
    try {
      await cliente.query(sql);
      await cliente.query("insert into public._migraciones (nombre) values ($1)", [f]);
      await cliente.query("commit");
      console.log(`✓ ${f}`);
    } catch (e) {
      await cliente.query("rollback");
      throw new Error(`${f}: ${e.message}`);
    }
  }
  console.log("Migraciones al día.");
} finally {
  await cliente.end();
}
