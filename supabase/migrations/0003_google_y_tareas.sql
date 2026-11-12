-- Conexión con Google (Calendar + Gmail) y tareas programadas.

-- Token de Google de cada usuario, cifrado por la web (nunca se guarda en claro).
create table if not exists public.google_conexiones (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  refresh_token_cifrado text not null,
  scopes text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.google_conexiones enable row level security;
drop policy if exists propia on public.google_conexiones;
create policy propia on public.google_conexiones for all to authenticated
  using (user_id = auth.uid() and public.es_miembro())
  with check (user_id = auth.uid() and public.es_miembro());

-- Evento de Google Calendar asociado a la reunión.
alter table public.contactos add column if not exists evento_google_id text;
alter table public.contactos add column if not exists evento_google_url text;

-- Registro de avisos y tareas ya hechas (evita mandar dos veces el mismo correo).
create table if not exists public.avisos_enviados (
  clave text primary key,
  enviado timestamptz not null default now(),
  detalle text
);
alter table public.avisos_enviados enable row level security;
drop policy if exists miembros on public.avisos_enviados;
create policy miembros on public.avisos_enviados for all to authenticated using (public.es_miembro()) with check (public.es_miembro());

insert into public.config (clave, valor, nota) values
  ('correo_avisos', '', 'A dónde llegan los avisos (vacío = el correo de la cuenta de Google conectada)'),
  ('aviso_resumen_hora', '08:30', 'Hora del resumen diario (días hábiles). Vacío = no enviar'),
  ('aviso_reunion_minutos', '60', 'Minutos antes de una reunión para avisar que mandes el enlace. 0 = no avisar'),
  ('aviso_reporte_semanal', 'SI', 'Reporte de la semana anterior los lunes con el resumen'),
  ('busquedas_auto_semana', '3', 'Búsquedas de Places que corren solas cada domingo a la noche (0 = ninguna). Cada una usa hasta 3 solicitudes')
on conflict (clave) do nothing;
