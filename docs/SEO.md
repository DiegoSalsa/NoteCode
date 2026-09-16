# NoteCode SEO

Módulo interno de inteligencia SEO. En código el namespace es `seo` (`/seo`, `/api/seo`, `lib/seo`). No acoplar el nombre comercial.

P0 cubre arquitectura, OAuth de Google, descubrimiento GSC/GA4, vínculo a `Project`, sync, histórico propio, overview y dashboard.

P1A cubre keywords, rank tracking, DataForSEO, snapshots SERP, competidores y presupuestos.

P1B cubre crawler HTTP propio, Site Audit, SEO Health, diffs, alertas y creación manual de `ProjectTask`.

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
3. Authorized redirect URIs:
   - Local: `http://localhost:3000/api/seo/google/callback`
   - Producción: `https://notecode.purocode.com/api/seo/google/callback`
4. Configura:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/seo/google/callback
SEO_TOKEN_ENCRYPTION_KEY=  # 32 bytes; si se omite se usa ENCRYPTION_KEY
```

En Vercel usa `APP_URL=https://notecode.purocode.com` y
`GOOGLE_REDIRECT_URI=https://notecode.purocode.com/api/seo/google/callback`.

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

- **Un solo scheduler efectivo:** `GET /api/seo/jobs/run` con `Authorization: Bearer $CRON_SECRET` (13:00 UTC).
- `/api/automations/run` ya **no** dispara SEO (evita doble ejecución y doble costo).
- Manual: `POST /api/seo/jobs/run` (ADMIN/MANAGER) o sync por proyecto.
- El lease diario `seo-scheduler:YYYY-MM-DD` impide que dos crons del mismo día ejecuten el lote. Un POST manual no queda bloqueado por ese lease, pero las SERPs ya guardadas hoy no se vuelven a pagar.

Cada job guarda `status`, `startedAt`, `finishedAt`, `durationMs`, `error`, `recordsProcessed`, `idempotencyKey`. Los jobs `update-rankings` también guardan keywords requested/skipped/success/failed y `estimatedCost`.

## Seguridad

- Access/refresh tokens se cifran con AES-256-GCM (`SEO_TOKEN_ENCRYPTION_KEY` o `ENCRYPTION_KEY`).
- Nunca se envían al cliente. `toPublicConnection()` elimina ciphertext.
- Logs pasan por `redactValue` (claves `token` / `secret` / `authorization`).
- Refresh automático si el access token vence; estado `expired` / `revoked` si Google lo invalida.
- Desconectar revoca el token en Google y borra el refresh local.

## Providers

Toda consulta SERP pasa por `getSerpProvider()` (`lib/seo/providers/index.ts`). El contrato está en `lib/seo/providers/serp.ts`. DataForSEO es la primera implementación (`DataForSeoSerpProvider`).

```text
SEO → SerpProvider → DataForSeoSerpProvider
POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced
```

Setup:

```text
SEO_SERP_PROVIDER=dataforseo
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
SEO_DATAFORSEO_DAILY_BUDGET_USD=2
SEO_DATAFORSEO_MONTHLY_BUDGET_USD=10
SEO_SERP_DEPTH=100
SEO_SERP_CONCURRENCY=3
```

Si faltan login/password la UI muestra **Proveedor SERP no configurado**. No hay datos simulados.

Para agregar otro provider: implementa `SerpProvider`, no llames al vendor desde páginas.

### Costos

Live Google Organic se factura ~US$0.002 por cada 10 resultados. Con `SEO_SERP_DEPTH=100` una keyword cuesta ~US$0.02. 25 keywords/día ≈ US$0.50/día ≈ US$15/mes, por eso el budget mensual por defecto es US$10 y corta el job con `budget_exceeded`.

Cada llamada pagada se registra en `seo_api_usage` (provider, endpoint, operation, requests, units, estimatedCost USD, status, duration, project).

El botón **Actualizar posiciones** tiene cooldown (10 min) y no vuelve a pagar una keyword que ya tiene ranking del día UTC.

### Rankings vs GSC

- Rank tracker: posición observada en una SERP concreta (DataForSEO).
- GSC: posición media ponderada por impresiones reales.
- La UI los etiqueta por separado. Nunca son la misma métrica.

### Dominio propio

`normalizeDomain` quita protocolo, `www`, path y `sc-domain:`. Un resultado es propio si el hostname es igual al `primaryDomain` del proyecto o un subdominio de ese dominio. No se usa `includes()`.

### Visibility

Fórmula interna, no es una métrica de Google:

`Visibility = 100 * Σ CTR-weight(position) / (trackedSERPs * CTR-weight(1))`

Pesos en `lib/seo/visibility.ts`.

### Competidores

Manuales en `/seo/proyectos/:id/competitors`. Detectados a partir de snapshots (overlap ≥ 2 keywords), nunca auto-confirmados. Se excluyen el dominio propio y verticales grandes (Google, YouTube, etc.), ampliables con `SEO_COMPETITOR_EXCLUDE_DOMAINS`.

## Depurar syncs

1. `/seo/integraciones` — estado de la cuenta (`connected`, `expired`, `revoked`, `error`).
2. Dashboard del proyecto — `lastGscError` / `lastGa4Error`.
3. `GET /api/seo/jobs` — últimos jobs.
4. Logs JSON: eventos `seo.gsc.sync`, `seo.ga4.sync`, `seo.oauth.*`. Nunca contienen tokens.

## Crawler y Site Audit (P1B)

HTTP crawler propio (`lib/seo/crawler.ts`). No usa DataForSEO OnPage ni headless browser.

SSRF (`lib/seo/ssrf.ts`): bloquea localhost, loopback, RFC1918, link-local, metadata, IPv6 ULA, protocolos no HTTP(S) y userinfo. Resuelve DNS y valida cada IP. Los redirects se revalidan. No sale del hostname permitido (`www` ≡ apex; `blog.` no).

Batches Vercel: `SEO_CRAWL_BATCH_PAGES` (20) + checkpoint. El cron reanuda crawls `running`.

Health: `100 − penalty` (0–100). Por `ruleKey`: peso × (0.35 + 0.65×cobertura) × log de repetición, con cap. Ver `lib/seo/health.ts`.

Alertas: dedupe por `identityKey` mientras están `open`. Health drop default 10 puntos. **Crear tarea** usa `ProjectTask`; no hay alta automática.

SERP: manual = Live; cron = Standard Queue (`SEO_SERP_MANUAL_MODE` / `SEO_SERP_SCHEDULED_MODE`).

HTML no se guarda. Retención automática de links/páginas queda para más adelante.

## Keyword research y Content intelligence (P2A)

`KeywordResearchProvider` es independiente de `SerpProvider`. DataForSEO Labs: overview, suggestions, related. Questions se derivan de esas listas (no hay un tercer pago si ya están en cache).

Cache persistente 30 días (`seo_keyword_research_cache`). Orden de fuentes: GSC → rankings/SERP locales → cache → API pagada. Budget DataForSEO compartido.

Search Volume ≠ GSC Impressions. La UI lo etiqueta.

Opportunity score (0–100, no es Health): ver `lib/seo/opportunity-score.ts`. Confidence LOW/MEDIUM/HIGH según impresiones y días. Cannibalization exige ≥5 días y ≥10 impresiones por URL. Decay exige caída ≥30% y ≥20 clicks absolutos, con mínimo 50 clicks o 500 impr. previas.

Keyword gap usa solo SERPs trackeadas de competidores confirmados.

## Pendiente

- P2B: backlinks, CWV avanzado, reportes PDF.
- P3: GitHub correlation, agente SEO, AEO / AI visibility.
