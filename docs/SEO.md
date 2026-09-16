# NoteCode SEO

Módulo interno de inteligencia SEO. En código el namespace es `seo` (`/seo`, `/api/seo`, `lib/seo`). No acoplar el nombre comercial.

P0 cubre arquitectura, OAuth de Google, descubrimiento GSC/GA4, vínculo a `Project`, sync, histórico propio, overview y dashboard.

## Arquitectura

NoteCode no usa una carpeta `/modules`. El módulo sigue el patrón existente:

- UI: `app/seo`
- API: `app/api/seo`
- Servicios: `lib/seo`
- Componentes: `components/seo`
- Modelos Prisma: `Seo*` relacionados con `Project` y `Client` existentes

Un proyecto de empresa puede habilitar SEO mediante `SeoProject` (1:1 con `Project`). No existe `SeoClient` ni `SeoOrganization`.

Permisos (roles actuales, no un RBAC paralelo):

- Ver: cualquier usuario autenticado
- Vincular / sincronizar: `ADMIN` o `MANAGER`
- OAuth Google: solo `ADMIN`

## Cómo conectar Google

1. En Google Cloud, crea un cliente OAuth **Web application**.
2. Scopes de solo lectura:
   - `https://www.googleapis.com/auth/webmasters.readonly`
   - `https://www.googleapis.com/auth/analytics.readonly`
   - `openid email profile`
3. Authorized redirect URI: `{APP_URL}/api/seo/google/callback`
4. Configura:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/seo/google/callback
SEO_TOKEN_ENCRYPTION_KEY=  # 32 bytes; si se omite se usa ENCRYPTION_KEY
```

5. Entra a `/seo/integraciones` con un usuario `ADMIN` y pulsa **Conectar Google**.
6. Autoriza la cuenta de PuroCode que tiene acceso a las propiedades.
7. NoteCode descubre GSC y GA4. Confirma el vínculo con cada `Project`. Nada se asocia de forma destructiva.

Si faltan las variables, la UI muestra **Integración no configurada**. No hay datos simulados.

## Cómo agregar un proyecto

1. El proyecto debe existir en NoteCode y ser `COMPANY` (los personales no entran al portafolio SEO).
2. En Integraciones, elige GSC + GA4 y el proyecto.
3. Al confirmar se crea/actualiza `SeoProject` y se lanza un sync.

Productos internos (Puragenda, etc.) usan el mismo `Project` sin `Client` o con cliente interno. No hay un flag especial.

## Sincronización

- GSC: clicks, impressions, CTR, position por fecha, query, page, device, country.
- GA4: users, sessions, engaged sessions, engagement rate, organic sessions, key events, landings, source/medium.
- Primera sync: histórico de sitio (~16 meses) + detalle reciente (28 días).
- Sync diaria: últimos 7 días (Google corrige filas con retraso).
- Upsert por `(seoProjectId, date, dimensión)` → idempotente.

Jobs:

- Cron Vercel `GET /api/seo/jobs/run` con `Authorization: Bearer $CRON_SECRET` (12:30 UTC).
- El cron existente `/api/automations/run` también dispara SEO para no depender de un cron extra.
- Manual: botón Sincronizar en el dashboard del proyecto, o `POST /api/seo/jobs/run`.

Cada job guarda `status`, `startedAt`, `finishedAt`, `durationMs`, `error`, `recordsProcessed`, `idempotencyKey`.

## Seguridad

- Access/refresh tokens se cifran con AES-256-GCM (`SEO_TOKEN_ENCRYPTION_KEY` o `ENCRYPTION_KEY`).
- Nunca se envían al cliente. `toPublicConnection()` elimina ciphertext.
- Logs pasan por `redactValue` (claves `token` / `secret` / `authorization`).
- Refresh automático si el access token vence; estado `expired` / `revoked` si Google lo invalida.
- Desconectar revoca el token en Google y borra el refresh local.

## Providers

`lib/seo/providers/serp.ts` define `SerpProvider`. P0 no llama a DataForSEO. P1 implementará rankings y keyword research detrás de esa interfaz, con `seo_api_usage` para costo.

Para agregar otro provider:

1. Implementa `SerpProvider`.
2. Registra llamadas en `SeoApiUsage`.
3. No importes el SDK del vendor desde páginas o APIs de dashboard; pasa por `lib/seo/providers`.

## Depurar syncs

1. `/seo/integraciones` — estado de la cuenta (`connected`, `expired`, `revoked`, `error`).
2. Dashboard del proyecto — `lastGscError` / `lastGa4Error`.
3. `GET /api/seo/jobs` — últimos jobs.
4. Logs JSON: eventos `seo.gsc.sync`, `seo.ga4.sync`, `seo.oauth.*`. Nunca contienen tokens.

## SEO Health

P0 no inventa un score. El número ponderado por issues de auditoría llega en P1 (`lib/seo` documentará la fórmula junto al crawler).

## Pendiente

- P1: keywords, rankings, SERP provider, competidores, crawler, auditoría, alertas, tareas.
- P2: keyword research, backlinks, content opportunities, reportes exportables, CWV.
- P3: correlación GitHub, agente SEO, AEO / AI visibility.
