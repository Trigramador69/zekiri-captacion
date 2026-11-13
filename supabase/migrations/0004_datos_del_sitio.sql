-- Datos que se leen del sitio web de cada empresa (WhatsApp, correo y redes).
alter table public.empresas add column if not exists whatsapp text;
alter table public.empresas add column if not exists correo text;
alter table public.empresas add column if not exists redes jsonb not null default '{}'::jsonb;
-- Cuándo se leyó el sitio (null = pendiente). También se marca si no tiene web propia.
alter table public.empresas add column if not exists web_leida timestamptz;

create index if not exists empresas_web_pendiente_idx on public.empresas (creado) where web_leida is null and web is not null;
