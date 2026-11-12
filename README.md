# Captación Zékiri — sistema interno

Web interna para todo el proceso de captación: buscar empresas en Google Places, revisarlas, trabajar la cola del día con el mensaje listo y el botón de WhatsApp, registrar respuestas, gerentes y reuniones, compartir materiales y ver las métricas del embudo.

**Stack:** Next.js 15 (App Router) + Tailwind + shadcn/ui · Supabase (Postgres, login por código al correo, archivos) · Vercel. La lógica de estados y seguimientos es la misma de `../sistema/lib/captacion.js` (copiada en `src/lib/captacion.js`).

## Pantallas

| Ruta | Para qué |
| --- | --- |
| `/` Hoy | Siguiente acción, avance del día contra el límite, semana, reuniones, actividad |
| `/cola` | Cola del día: seguimientos vencidos → nuevos A → nuevos B. Mensaje editable, variante A/B, plantillas de objeciones, materiales, **Abrir WhatsApp → ¿Lo enviaste? → Sí** |
| `/revisar` | Revisión rápida: señales de LinkedIn/sitio (atajos 1–5), dato de personalización, aprobar (crea el contacto en la cola) o descartar con motivo |
| `/empresas` y ficha | Buscador, contactos, historial, ficha de traspaso para quien atiende la reunión y enlace a Google Calendar |
| `/pipeline` | Tablero por etapa |
| `/reuniones` | Próximas, por registrar resultado e historial |
| `/metricas` | Embudo, semanas, test A/B de punta a punta y veredicto de la sección 8.3 del plan |
| `/materiales` | PDFs y enlaces para compartir (cada envío queda en el historial) |
| `/config` | Datos de los mensajes, plantillas, búsquedas de Places (botón **Buscar**), exclusión, usuarios y feriados |

## 1. Supabase (≈ 10 minutos)

1. Entra a [supabase.com](https://supabase.com) con la cuenta de Zékiri → **New project**. Nombre `zekiri-captacion`, región **South America (São Paulo)**, plan Free. Guarda la contraseña de la base en tu gestor de contraseñas.
2. **Project Settings → API Keys**: copia la *Project URL*, la *publishable key* y la *secret key*.
3. **Project Settings → Database → Connection string → Session pooler**: copia la URI y reemplaza `[YOUR-PASSWORD]` por la contraseña.
4. Copia `.env.example` como `.env.local` (ya está creado) y completa los valores. **No los pegues en el chat.** `PLACES_API_KEY` es la misma de `sistema/.env`.
5. **Authentication → Sign In / Providers → Email**: deja *Email* activado y **desactiva “Allow new users to sign up”**. Solo entran usuarios que tú agregues.
6. **Plantilla del correo: no hace falta tocarla.** Sin SMTP propio, Supabase manda su correo estándar con un enlace, y la web lo acepta (hay que abrirlo en el mismo navegador donde se pidió). Ojo: el correo integrado de Supabase solo llega a miembros del equipo de la organización en Supabase y manda pocos por hora. Para invitar a otras personas o recibir un código de 6 dígitos, más adelante se conecta un SMTP propio (por ejemplo Resend o Gmail con contraseña de aplicación) en **Authentication → Emails → SMTP**. Después se puede agregar `{{ .Token }}` a la plantilla *Magic Link*.

7. **Authentication → URL Configuration**: *Site URL* `http://localhost:3000` por ahora (después, la de Vercel). En *Redirect URLs* agrega `http://localhost:3000/**`.
8. **Authentication → Users → Add user → Create new user**: tu correo, una contraseña cualquiera y **Auto Confirm User** marcado. Repite para tu jefe o quien atienda reuniones.

Después, en esta carpeta:

```bash
npm run db:migrar
```

```bash
npm run db:sembrar -- --empresas ../sistema/salida/empresas_2026-11-10.csv
```

El primero crea tablas, seguridad y el espacio de archivos. El segundo carga configuración, 27 plantillas, feriados, 30 búsquedas y las empresas de la búsqueda del 10 de noviembre.

Si agregaste usuarios **antes** de correr la migración, créales el perfil en **SQL Editor**:

```sql
insert into perfiles (id, nombre, rol) select id, split_part(email, '@', 1), 'admin' from auth.users on conflict do nothing;
```

## 2. Probar en tu computadora

```bash
npm run dev
```

Abre http://localhost:3000, pide el enlace y ábrelo en el mismo navegador. Completa **Configuración → General** (cargo, número, sitio).

## 3. Publicar en Vercel

1. Sube esta carpeta a un repositorio **privado** de GitHub (por ejemplo `zekiri/captacion`).
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio. Si el repositorio contiene toda la carpeta `autoclient`, pon **Root Directory = `web`**.
3. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PLACES_API_KEY` y las de las secciones 4 y 5 (no hace falta `SUPABASE_DB_URL`).
4. **Deploy**. Copia la URL (`https://….vercel.app`) y vuelve a Supabase → *URL Configuration*: ponla como *Site URL* y agrégala en *Redirect URLs* como `https://….vercel.app/**`.
5. En Google Cloud, la clave de Places puede seguir restringida solo por API (las llamadas salen del servidor de Vercel, no del navegador).

Cada `git push` vuelve a publicar.

## 4. Google Calendar con Meet automático

La cuenta de Google de diego.trigo@zekiri.io es una cuenta común (el correo de zekiri.io está en Zoho, no en Google Workspace), así que la app es **Externa** y se **publica sin revisión de Google**. Solo pide permiso de **Calendar**.

1. [console.cloud.google.com](https://console.cloud.google.com), proyecto `zekiri-captacion`.
2. **APIs y servicios → Biblioteca**: habilita **Google Calendar API**.
3. **Google Auth Platform → Información de la marca**: nombre `Captación Zékiri`, correo de asistencia y correo de contacto del desarrollador. **Sin logotipo** (con logotipo Google exige revisión). Página principal, privacidad y condiciones: vacías.
4. **Acceso a los datos**: solo `…/auth/calendar.events`.
5. **Clientes → Aplicación web**: URI de redireccionamiento `http://localhost:3000/api/google/callback`.
6. ID y secreto en `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). **No los pegues en el chat.**
7. **Mientras la web no esté publicada:** deja la app en **Prueba** y agrégate en **Público → Usuarios de prueba**. El permiso dura 7 días (alcanza para probar).
   **Al publicar la web** (Google pide página principal y política de privacidad en un dominio propio): Información de la marca → página principal `https://zekiri.io`, política de privacidad `https://captacion.zekiri.io/privacidad` (ya incluida en la web), dominio autorizado `zekiri.io` → **Público → Publicar app** y reconectar una vez. Desde ahí no vence.
8. Reinicia la web (`npm run local`) → **Configuración → Integraciones → Conectar con Google**. Aparece una vez «Google no verificó esta app»: **Configuración avanzada → Ir a Captación Zékiri** → permitir Calendar.

Al agendar una reunión se crea el evento con su **Meet**, se invita al gerente si tiene correo y el enlace queda para el recordatorio. Al reprogramar se mueve; si la reunión se cae, se cancela.

**Para probar en Vercel** no hace falta publicar la app de Google: con la app en **Prueba**, agrega `https://TU-PROYECTO.vercel.app/api/google/callback` en el cliente y listo.

**Al publicar la app de Google (producción):** Google no acepta `vercel.app` como dominio de la marca. Usa un subdominio propio (por ejemplo `captacion.zekiri.io`), agrega `zekiri.io` en **Dominios autorizados** y `https://captacion.zekiri.io/api/google/callback` en el cliente.

## 5. Correo de avisos con Zoho (y código de inicio de sesión)

Los avisos salen desde diego.trigo@zekiri.io por SMTP. **Requisito:** el plan gratuito de Zoho Mail (*Forever Free*) no permite SMTP; hace falta un plan pago. Si es el gratuito, usa Resend (abajo).

1. Zoho Mail → **Configuración → Cuentas de correo → IMAP/POP**: confirma que el acceso está permitido. Ahí mismo, en *Detalles de configuración del servidor*, está el host SMTP exacto (`smtp.zoho.com` o `smtppro.zoho.com`).
2. [accounts.zoho.com](https://accounts.zoho.com) → **Seguridad → Contraseñas específicas de la aplicación → Generar**. Nombre: `Captación web`. Copia la contraseña (se ve una sola vez). Si no aparece la opción, activa primero la verificación en dos pasos.
3. En `.env.local`: `SMTP_USER=diego.trigo@zekiri.io`, `SMTP_PASS=` la contraseña generada y `SMTP_HOST=` el host del paso 1.
4. Reinicia la web → **Integraciones → Enviarme el resumen ahora** para probar.

**Alternativa sin Zoho pago: Resend** (gratis hasta 3.000 correos al mes). [resend.com](https://resend.com) → agrega el dominio `zekiri.io` y copia en tu DNS los registros que te muestra → crea una API key. En `.env.local`: `SMTP_HOST=smtp.resend.com`, `SMTP_USER=resend`, `SMTP_PASS=` la API key y `SMTP_FROM=diego.trigo@zekiri.io`.

**El mismo Zoho para el inicio de sesión** (código de 6 dígitos y sin el límite de 2 correos por hora): Supabase → **Authentication → Emails → SMTP Settings** → activar, host `smtp.zoho.com`, puerto `465`, usuario y contraseña de aplicación de arriba, remitente `diego.trigo@zekiri.io`, nombre `Captación Zékiri`. Después ya se puede editar **Authentication → Emails → Magic Link**: asunto `Tu código para entrar a Captación Zékiri` y, en **Source**, este cuerpo:

```html
<h2>Tu código para entrar a Captación Zékiri</h2>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>O entra con este enlace (en el mismo navegador): <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Entrar</a></p>
<p>Vence en 1 hora. Si no lo pediste, ignora este correo.</p>
```

## 6. Tareas programadas con n8n

La web tiene un punto `POST /api/tareas` que hace todo lo que debe pasar solo:

| Cuándo | Qué hace |
| --- | --- |
| Cada vez | Cierra los contactos vencidos sin mensajes restantes |
| Días hábiles, a la hora del resumen (8:30) | Correo con seguimientos, nuevos, respuestas pendientes y reuniones del día |
| Lunes | Agrega al resumen el reporte de la semana anterior |
| 1 hora antes de cada reunión | Correo con el enlace de Meet y el botón de WhatsApp con el mensaje listo |
| Domingo desde las 20:00 | Corre las búsquedas de Places que hace más tiempo no se buscan (3 por defecto) |

Cada aviso se registra para no mandarlo dos veces. Todo se ajusta en **Configuración → Integraciones**, donde también se ve cuándo corrió por última vez y hay un botón **Ejecutar ahora**.

n8n solo hace de reloj (tiene que poder llegar a la web, así que funciona cuando la web está publicada):

1. n8n → **Import from File** → `n8n/F7_tareas_programadas.json`.
2. En el nodo **Llamar a la web**: cambia la URL por la de tu web y `PEGAR_TAREAS_SECRETO` por el valor de `TAREAS_SECRETO`.
3. **Publish**.

## Variables en Vercel

Además de las de Supabase y Places: `TOKEN_CIFRADO_CLAVE` (**la misma** que en `.env.local`, o habrá que reconectar Google), `TAREAS_SECRETO`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SMTP_USER`, `SMTP_PASS` y, si cambiaste, `SMTP_HOST`.

## Costos

Supabase Free (500 MB de base, 1 GB de archivos), Vercel Hobby y Places dentro de las 1.000 solicitudes gratis al mes: **US$ 0**. Límite a vigilar: el correo integrado de Supabase manda pocos correos por hora; para 2–3 usuarios alcanza. Si hace falta más, se conecta un SMTP propio (Authentication → Emails → SMTP).

## Seguridad

- Sin registro abierto: solo entran usuarios creados en Supabase, y cada tabla exige tener perfil (RLS).
- La clave secreta y la de Places solo existen en el servidor (variables sin `NEXT_PUBLIC_`).
- Las páginas llevan `noindex` y no se pueden incrustar en otros sitios.
- Los materiales son públicos **por enlace** (para poder mandarlos a prospectos); no subas nada confidencial ahí.

## Si cambia la lógica

La lógica de estados vive en `../sistema/lib/captacion.js` (con sus pruebas). Si se cambia, copiarla a `src/lib/captacion.js`.
