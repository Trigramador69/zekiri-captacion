-- Reuniones: enlace (Meet/Zoom) y recordatorios con enlace el mismo día.

alter table public.contactos add column if not exists enlace_reunion text;

insert into public.plantillas (id, rol, canal, variante, texto, notas) values
  ('REU_ENLACE', 'gerente', 'WhatsApp', null,
   'Buenos días, {nombre}. Le comparto el enlace para nuestra reunión de hoy a las {hora}: {enlace}. Nos vemos ahí.',
   'Mismo día, 1 hora antes (reuniones por Meet o Zoom)'),
  ('REU_HOY', 'gerente', 'WhatsApp', null,
   'Buenos días, {nombre}. Le confirmo nuestra reunión de hoy a las {hora}, {modalidad}. Cualquier cambio me avisa por aquí.',
   'Mismo día, 1 hora antes (reuniones presenciales o por llamada)')
on conflict (id) do nothing;

-- "mañana" no sirve si el recordatorio sale un viernes para una reunión del lunes: usar el día.
update public.plantillas
set texto = 'Buenos días, {nombre}. Le recuerdo nuestra reunión del {dia} a las {hora}, {modalidad}. ¿Sigue en pie?',
    actualizado = now()
where id = 'REU_RECORDATORIO' and texto = 'Le recuerdo nuestra reunión de mañana a las {hora}. ¿Sigue en pie?';
