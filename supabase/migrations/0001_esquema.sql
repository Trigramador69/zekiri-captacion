-- Sistema interno de captación de Zékiri: esquema inicial.
-- Los nombres de columnas siguen a la planilla "Prospección 2026" para que la migración sea directa.

create extension if not exists pgcrypto;

-- ───────── Usuarios ─────────
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '',
  rol text not null default 'captador' check (rol in ('admin', 'captador', 'responsable', 'gerencia')),
  creado timestamptz not null default now()
);

-- Crea el perfil al invitar a un usuario.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre) values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users for each row execute function public.crear_perfil();

-- ───────── Configuración y catálogos ─────────
create table if not exists public.config (
  clave text primary key,
  valor text,
  nota text
);

create table if not exists public.plantillas (
  id text primary key,
  rol text,
  canal text,
  variante text,
  texto text not null,
  notas text,
  actualizado timestamptz not null default now()
);

create table if not exists public.feriados (
  fecha date not null,
  nombre text not null,
  ambito text not null default 'nacional' check (ambito in ('nacional', 'SCZ', 'LPZ', 'CBBA')),
  verificado boolean not null default false,
  primary key (fecha, ambito)
);

create table if not exists public.consultas (
  id text primary key,
  ciudad text not null check (ciudad in ('SCZ', 'LPZ', 'CBBA')),
  zona text,
  sector text,
  termino text not null,
  activa boolean not null default true,
  ultima_ejecucion timestamptz,
  resultados int,
  notas text
);

-- ───────── Empresas ─────────
create table if not exists public.empresas (
  place_id text primary key,
  empresa text not null,
  ciudad text check (ciudad in ('SCZ', 'LPZ', 'CBBA')),
  zona text,
  sector text,
  consulta_origen text,
  direccion text,
  tel_publico text,
  tel_tipo text check (tel_tipo in ('celular', 'fijo', 'sin_telefono')),
  web text,
  resenas int not null default 0,
  sucursales int not null default 1,
  linkedin_empresa text,
  empleados_li text,
  puntaje_base int,
  puntaje_detalle text,
  puntaje_revision int check (puntaje_revision between 0 and 7),
  puntaje_final int generated always as (coalesce(puntaje_base, 0) + coalesce(puntaje_revision, 0)) stored,
  estado_empresa text not null default 'NUEVA'
    check (estado_empresa in ('NUEVA', 'EN_REVISION', 'LISTA', 'EN_CURSO', 'DESCARTADA', 'NO_CONTACTAR')),
  motivo_descarte text,
  canal_inicial text,
  dato_personalizacion text,
  fecha_alta date not null default (now() at time zone 'America/La_Paz')::date,
  verificado_por uuid references public.perfiles (id) on delete set null,
  fecha_verificacion timestamptz,
  notas text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists empresas_estado_idx on public.empresas (estado_empresa, ciudad, puntaje_base desc);

-- ───────── Contactos ─────────
create sequence if not exists public.contacto_seq;

create table if not exists public.contactos (
  contacto_id text primary key default ('C' || lpad(nextval('public.contacto_seq')::text, 4, '0')),
  place_id text references public.empresas (place_id) on delete cascade,
  rol_contacto text not null default 'recepcion' check (rol_contacto in ('recepcion', 'gerente', 'otro')),
  origen_contacto text,
  persona_derivo text,
  nombre text,
  cargo text,
  canal text not null default 'WhatsApp' check (canal in ('WhatsApp', 'LinkedIn', 'correo', 'llamada')),
  telefono_e164 text,
  correo text,
  linkedin_url text,
  responsable_reunion text,
  estado text not null default 'LISTO',
  plantilla_siguiente text,
  variante_mensaje text check (variante_mensaje in ('A', 'B')),
  mensaje_siguiente text,
  fecha_ultimo_envio date,
  n_envios_sin_resp int not null default 0,
  proxima_accion text,
  fecha_proxima date,
  ultima_respuesta text,
  objecion text,
  fecha_reunion timestamptz,
  modalidad_reunion text,
  resultado text,
  notas text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists contactos_cola_idx on public.contactos (estado, fecha_proxima);
create index if not exists contactos_place_idx on public.contactos (place_id);

-- ───────── Materiales ─────────
create table if not exists public.materiales (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  sector text,
  tipo text not null default 'pdf',
  archivo text,           -- ruta en el bucket "materiales"
  url text,               -- enlace público para compartir
  peso_bytes bigint,
  orden int not null default 0,
  creado timestamptz not null default now()
);

-- ───────── Eventos (historial y métricas) ─────────
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  contacto_id text references public.contactos (contacto_id) on delete set null,
  place_id text,
  estado_anterior text,
  estado_nuevo text not null,
  canal text,
  variante text,
  ciudad text,
  primer_contacto boolean not null default false,
  registrado_por text,
  nota text,
  material_id uuid references public.materiales (id) on delete set null
);
create index if not exists eventos_fecha_idx on public.eventos (fecha desc);
create index if not exists eventos_contacto_idx on public.eventos (contacto_id, fecha desc);

-- ───────── Exclusión (obligatoria) ─────────
create table if not exists public.exclusion (
  id bigint generated always as identity primary key,
  telefono_e164 text,
  place_id text,
  linkedin_url text,
  correo text,
  fecha date not null default (now() at time zone 'America/La_Paz')::date,
  motivo text,
  contacto_id text
);

-- ───────── actualizado automático ─────────
create or replace function public.tocar_actualizado() returns trigger language plpgsql as $$
begin new.actualizado = now(); return new; end $$;

drop trigger if exists empresas_actualizado on public.empresas;
create trigger empresas_actualizado before update on public.empresas for each row execute function public.tocar_actualizado();
drop trigger if exists contactos_actualizado on public.contactos;
create trigger contactos_actualizado before update on public.contactos for each row execute function public.tocar_actualizado();

-- ───────── Seguridad: solo usuarios invitados (con perfil) ─────────
create or replace function public.es_miembro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['perfiles', 'config', 'plantillas', 'feriados', 'consultas', 'empresas', 'contactos', 'materiales', 'eventos', 'exclusion']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists miembros on public.%I', t);
    execute format('create policy miembros on public.%I for all to authenticated using (public.es_miembro()) with check (public.es_miembro())', t);
  end loop;
end $$;

-- ───────── Archivos de materiales ─────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('materiales', 'materiales', true, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists materiales_subir on storage.objects;
create policy materiales_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'materiales' and public.es_miembro());
drop policy if exists materiales_borrar on storage.objects;
create policy materiales_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'materiales' and public.es_miembro());
drop policy if exists materiales_cambiar on storage.objects;
create policy materiales_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'materiales' and public.es_miembro());
