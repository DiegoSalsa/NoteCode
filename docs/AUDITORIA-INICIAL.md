# Diagnóstico inicial — NoteCode

Fecha: 2026-08-31  
Repositorio: `C:\Users\diego\Desktop\NoteCode`  
Rama: `main` (`dca6936`)  
Estado Git: limpio, al día con `origin/main`

Línea base ejecutada antes de cambios:

| Comando | Resultado |
|---|---|
| `npm test` | 3 archivos, 9 pruebas, OK (solo impuestos Chile) |
| `npx tsc --noEmit` | OK |
| `npm run lint` | alias de `tsc --noEmit` |
| ESLint / Playwright / axe | no configurados |
| Migraciones Prisma formales | no hay carpeta `prisma/migrations`; el proyecto usa SQL manual |

Este documento es el diagnóstico obligatorio previo a la implementación. No se imprimieron secretos, tokens ni contenido de credenciales.

---

## Arquitectura y tecnologías

**Evidencia:** `package.json`, `prisma/schema.prisma`, `DEPLOYMENT.md`, `proxy.ts`, `app/layout.tsx`.

- Next.js 16 (App Router) + React 19 + TypeScript estricto.
- Prisma 6 + PostgreSQL (Supabase). Runtime con pooler (`DATABASE_URL`) y `DIRECT_URL` para migraciones.
- Autenticación propia: cookie `notecode_session` firmada HMAC-SHA256, scrypt para contraseñas, WebAuthn/passkeys.
- Cifrado de secretos: AES-256-GCM (`lib/crypto.ts`) con `ENCRYPTION_KEY` de 32 bytes fuera del repositorio.
- Despliegue: Vercel. Cron diario `/api/automations/run`. PWA (`manifest.ts`, `sw.js`).
- Asistente Gilberto (DeepSeek) + ERP (clientes, cotizaciones, facturas, tickets, impuestos F29 Chile).
- Caché in-memory por proceso (`lib/server-cache.ts`) con invalidación por prefijo.

**Severidad:** informativa.  
**Impacto:** la plataforma ya no es un bloc de notas: es un ERP interno + workspace de proyectos. El riesgo es que las mejoras de “conocimiento conectado” se diluyan si se copia Notion.  
**Causa:** evolución incremental (proyectos → ERP → Gilberto).  
**Solución:** conservar las secciones estructuradas del proyecto (tareas, requisitos, tecnologías, credenciales, notas, documentos, timeline) y añadir flexibilidad encima.

---

## Estructura de navegación

**Evidencia:** `components/Sidebar.tsx`, `app/` (páginas), `components/AppShell.tsx`.

Rutas internas: Hoy, Dashboard, Gilberto, Proyectos, Gestión (ERP), Reportes, Actividad, Notas, Correos, Documentos, Bóveda, Finanzas, Impuestos, Perfil.  
Móvil: barra inferior de 4 ítems + menú “más”. Escritorio: sidebar fija 240px.

Hallazgos:

1. No hay búsqueda global ni papelera en la navegación. **Media.** El usuario no puede localizar conocimiento cruzado ni recuperar eliminados.
2. Ficha de proyecto con 10 pestañas (General, Comercial, Operación, Tareas, Timeline, Requisitos, Tecnologías, Credenciales, Notas, Documentos). **Baja (positivo):** mantiene el enfoque estructurado.
3. `/establecer-clave` y `/portal/[token]` son públicos (`proxy.ts`).

---

## Modelo de datos

**Evidencia:** `prisma/schema.prisma`.

Entidades centrales de proyecto: `Project`, `ProjectRequirement`, `ProjectTask`, `ProjectTech`, `Credential`, `Note`, `Document`, `ProjectStatusLog`.  
ERP amplio: clientes, cotizaciones, facturas, tickets, gastos, nómina, F29, etc.

Huecos respecto al producto objetivo:

| Hueco | Severidad | Evidencia |
|---|---|---|
| Sin `code` tipo RF-01 en requisitos | Alta | `ProjectRequirement` solo tiene `description` |
| Sin `sortOrder` persistente en tareas/requisitos/tecnologías | Alta | orden por `createdAt`/`status` |
| Sin `version` para concurrencia optimista | Alta | last-write-wins |
| Tareas/requisitos/tecnologías sin `deletedAt` | Alta | `deleteMany` físico |
| Notas sin slug, tags, enlaces, historial | Alta | modelo `Note` plano |
| Proyecto sin objetivo, alcance, exclusiones, riesgos, hitos, ADR | Media | campos limitados a name/description/status/fechas/presupuesto |
| Sin tabla de idempotencia | Crítica | POSTs crean filas nuevas en cada reintento |
| `AuditEvent` sin `correlationId` ni tipo de actor | Media | `lib/audit.ts` |
| Clave de cifrado sin versionado en fila | Alta | `Credential.secretData` opaco, sin `key_version` |

---

## Gestión de proyectos, tareas, requisitos, notas, documentos y credenciales

**Evidencia:** `app/proyectos/[id]/page.tsx`, `app/api/projects/**`.

Lo que ya existe:

- Crear/listar proyectos (empresa y personal). Editar proyecto desde el listado (`app/proyectos/page.tsx` tiene modal y `saving`).
- Tareas agrupadas por estado (tablero estático, no drag-and-drop persistente).
- Requisitos con toggle de completado y visibilidad de cliente.
- Notas de proyecto con edición.
- Documentos con subida, MIME allowlist, checksum, visibilidad, `docSaving`.
- Credenciales cifradas, enmascaradas en GET.

Hallazgos:

1. **Crítica — duplicados por reenvío.** `addRequirement`, `addTask`, `addTech`, `addCredential`, `saveNote`, `updateStatus` no bloquean el botón ni usan clave de idempotencia. Enter en el input dispara el alta. `addTask` líneas 363-377; botón Plus líneas 727-729.  
   Impacto: un doble clic o latencia alta crea dos RF/tareas. El contador de pestaña usa `tasks.length` y sube al confirmar el refetch, pero el daño ya está en BD.

2. **Alta — no hay edición de requisitos, tareas, tecnologías ni metadatos de documento en la ficha.** Solo completar/mover/eliminar. El usuario debe borrar y recrear. PATCH de requisitos/tareas existe en API; no hay PATCH de tecnologías (`app/api/projects/[id]/techs/[techId]/route.ts` solo DELETE). PATCH de documentos solo cambia `clientVisible`.

3. **Alta — actualizaciones optimistas.** `toggleRequirement` y `moveTask` mutan el estado local antes de la respuesta. Hay rollback, pero un fallo de red intermitente o caché (`writeCachedJson`) deja la UI distinta al servidor.

4. **Media — `deleteRequirement` no pide confirmación** (línea 401-404), a diferencia de tareas/notas/credenciales.

5. **Media — ficha de proyecto no edita descripción, objetivo, fechas ni responsable.** Solo “Actualizar estado”.

---

## Autenticación y autorización

**Evidencia:** `lib/auth.ts`, `proxy.ts`, `app/actions/auth.ts`, rutas API.

Fortalezas:

- Cookie httpOnly, sameSite=lax, secure en production, 8 horas.
- Passwords con scrypt + salt + `timingSafeEqual`.
- Passkeys y reauth reciente para revelar secretos (`hasRecentWebAuthn`).
- `findAccessibleProject` aísla proyectos `PERSONAL`.
- Roles `ADMIN`/`MANAGER`/`FINANCE` para crear/editar proyectos de empresa, finanzas y publicación de documentos.

Hallazgos:

1. **Aceptado — los proyectos COMPANY son visibles a cualquier usuario autenticado.** Decisión de los propietarios (2026-08-31): NoteCode lo operan los dos dueños, no hay equipos ajenos. Los proyectos PERSONAL siguen aislados. El modelo `project_members` permanece preparado y desactivado. Las acciones sensibles (portales, bóveda de empresa sin proyecto, papelera definitiva, clientes) siguen exigiendo `canManage` o ADMIN.

2. **Alta — sesiones no revocables.** Token stateless firmado. Cambiar `passwordChangedAt` no invalida sesiones existentes (`verifySessionToken` no lo consulta).

3. **Media — comparación de firma en `proxy.ts` usa `!==` no constante en tiempo.** `lib/auth.ts` sí usa `timingSafeEqual`.

4. **Media — sin comprobación de Origin/CSRF en APIs JSON.** sameSite=lax mitiga CSRF clásico en POST cross-site, no cubre subdominios maliciosos ni clientes no navegador.

5. **Media — sin rate limit** en login, reveal de credenciales, búsqueda, export.

6. **Baja — enumeración:** las APIs responden 404 genérico en recursos ajenos (bien). Login por email puede filtrar existencia según mensajes (revisar `LoginForm`).

---

## Tratamiento de información sensible

**Evidencia:** `lib/crypto.ts`, `app/actions/credentials.ts`, `app/api/credentials/**`, `app/api/vault/route.ts`, `components/CredentialCard.tsx`, ficha de proyecto pestaña Credenciales.

Fortalezas:

- AES-256-GCM con IV aleatorio y auth tag. Clave fuera de Git.
- GET nunca devuelve `secretData`; placeholder `************`.
- Reveal exige passkey reciente y deja `AuditLog` `CREDENTIAL_REVEALED`.
- Tabla legacy `project_credentials_legacy` no se lee (`DEPLOYMENT.md`).

Hallazgos:

1. **Alta — una sola clave, sin rotación ni `key_version` en fila.** Rotar `ENCRYPTION_KEY` deja ilegibles todos los secretos.

2. **Alta — secretos revelados permanecen en estado React** (`revealedSecrets`) hasta desmontar la página. No hay auto-ocultado en la ficha de proyecto. El valor entra al DOM en texto plano al revelar.

3. **Alta — el formulario de credencial usa `type` implícito text para la contraseña** (`page.tsx` ~línea 930).

4. **Media — credenciales con `projectId` null son visibles a todos los usuarios autenticados** (`app/api/credentials/route.ts` OR `projectId: null`).

5. **Media — no hay auditoría de creación/modificación/eliminación de bóveda en `AuditEvent`**, solo `AuditLog` de reveal.

6. **Media — `url` y `notes` del formulario de credencial no se persisten**; el backend ignora esos campos. El usuario cree que se guardaron.

7. **Baja — CredentialCard no auto-oculta** (sí permite ocultar manualmente).

No se inspeccionó el contenido de notas reales ni se imprimieron secretos. Si en producción hay contraseñas pegadas en notas, la migración a bóveda debe ser opt-in del propietario.

---

## Experiencia de creación, edición y eliminación

| Flujo | Guardando visible | Bloqueo doble envío | Edición | Confirmación | Papelera |
|---|---|---|---|---|---|
| Proyecto (listado) | Sí | Parcial (`saving`) | Sí | Error en texto | Soft delete, sin restore UI |
| Proyecto (ficha) | No | No | Solo estado | No | — |
| Tarea | No | No | No (solo estado) | `confirm` al borrar | Hard delete |
| Requisito | No | No | No (solo completed) | No al borrar | Hard delete |
| Tecnología | No | No | No | No | Hard delete |
| Nota | En `/notas` sí; en ficha no | Ficha no | Sí | `confirm` | Soft, sin restore UI |
| Documento | Sí | Sí | Solo visibilidad | `confirm` | Soft, sin restore |
| Credencial | No | No | API sí, UI no | `confirm` | Soft, sin restore |

**Severidad conjunta: crítica/alta.** Es el dolor de producto reportado.

---

## Estados de carga, errores y confirmaciones

- Skeleton en listado de proyectos y ficha inicial: sí.
- `actionError` en ficha: sí, pero no `aria-live`.
- Documentos: error recuperable junto al formulario.
- Alta de tarea/requisito: si falla, el texto permanece (bien); si tiene éxito no hay toast, solo desaparece el input.
- `alert()` para fallos de reveal (inaccesible y bloqueante).
- Errores de API a menudo en inglés (`Failed to create task`).

**Severidad:** media.

---

## Accesibilidad (WCAG 2.2 AA)

**Evidencia:** ficha de proyecto, `Sidebar.tsx`, `globals.css`.

1. **Alta — botones solo icono sin nombre accesible:** Plus de tarea/requisito/tecnología, Trash, Eye, Pencil, X de modales. Algunos documentos sí tienen `title`.
2. **Alta — inputs sin `<label>` asociado** (placeholders como único nombre).
3. **Alta — modales sin focus trap, sin `role="dialog"`, sin devolver el foco.**
4. **Media — estado/prioridad solo por color** (`PriorityBadge` cambia color, el texto sí existe: mitigado parcialmente).
5. **Media — sin `aria-live` para guardado asíncrono.**
6. **Media — sin `prefers-reduced-motion`** (`globals.css` anima `transform: scale(0.98)` y spinners).
7. **Baja — contraste** tema oscuro generalmente adecuado; `text-neutral-600` sobre `neutral-900` puede fallar AA.
8. **Baja positiva:** móvil ya fuerza `min-height: 44px` y `font-size: 16px` en inputs.

No hay pruebas axe/playwright.

---

## Diseño adaptable

**Evidencia:** `globals.css`, `Sidebar.tsx`, ficha de proyecto.

- Sidebar oculta en `<md`, nav inferior presente. Formularios apilan en móvil.
- Tablero de tareas `xl:grid-cols-4` se apila: usable pero no compacto.
- Tablas de documentos en ficha son flex-col en móvil: aceptable.
- Acciones de eliminar en requisitos dependen de `sm:opacity-0 sm:group-hover:opacity-100`; en móvil son visibles (bien). En desktop requieren hover.
- No hay vista calendario ni timeline táctil específico.

**Severidad:** media.

---

## Rendimiento

**Evidencia:** `lib/server-cache.ts`, GET proyecto, `app/proyectos/page.tsx`.

- Caché 30s + SWR. Prefetch al hover del sidebar.
- GET `/api/projects/:id` hidrata casi todo el proyecto (tareas, notas, cotizaciones, time entries 100, etc.) en un solo payload. **Media:** ficha lenta al crecer.
- Sin virtualización. Listados paginan (25 proyectos, 30 notas).
- Fuente Inter desde Google Fonts bloquea render. **Baja.**
- Sin mediciones RUM. Baseline subjetivo: tests 5.6s (incluye import), typecheck ~7s.

No se midió LCP/INP en producción en esta auditoría (requiere entorno desplegado). Se medirá `tsc` y `vitest` antes/después.

---

## Pruebas existentes

Solo `lib/tax/*.test.ts` (RUT, F29, períodos). **Crítica** para el alcance pedido: cero cobertura de idempotencia, permisos, bóveda, CRUD de proyecto, a11y, import/export.

No hay E2E, ni auditoría de dependencias en CI visible, ni tests de migraciones.

---

## Exportación, respaldo y recuperación

- No hay export JSON/CSV/Markdown/ZIP.
- No hay import.
- Soft delete en proyectos/notas/documentos/credenciales sin UI de restauración.
- Backups: `DEPLOYMENT.md` / `GILBERTO-ROADMAP.md` los listan como pendientes. RPO/RTO no definidos.
- Política de retención inexistente.

**Severidad:** alta.

---

## Búsqueda y organización del conocimiento

- Búsqueda local en listados (proyectos, notas, documentos, bóveda) con debounce.
- No hay búsqueda global.
- Notas en ficha se renderizan como `<pre>` plano, no Markdown.
- Sin tags, backlinks, plantillas, historial, TOC, slash commands.
- Sin vistas guardadas ni propiedades personalizadas.

**Severidad:** alta para la propuesta diferencial (no copiar Notion, pero sí conocimiento conectado **dentro** del proyecto).

---

## Observabilidad y manejo de errores

- `console.error` puntual (`[projects:delete]`, `[push:notify]`).
- `AuditEvent` genérico poco usado en CRUD de proyecto.
- Sin correlation id en requests.
- Sin `/api/health` de proceso.
- Catch vacíos que tragan el error original y devuelven 500 genérico.
- Riesgo de loguear objetos de error que podrían incluir payloads.

**Severidad:** media.

---

## Seguridad general (resumen)

| Tema | Estado | Severidad |
|---|---|---|
| Auth cookie | httpOnly + HMAC | — |
| CSRF | sameSite lax, sin Origin check | Media |
| XSS | React escapa texto; Markdown futuro debe sanitizar | Alta (si se añade MD inseguro) |
| SQL injection | Prisma parametrizado | Baja residual |
| IDOR | personal aislado; company abierto a todos los logueados | Alta |
| Rate limit | ausente | Alta |
| Upload | MIME allowlist + 12MB + checksum | Baja positiva |
| Headers seguridad | no en `next.config.ts` | Media |
| CSP | ausente | Media |
| Dependencias | no auditadas en esta pasada | Media hasta `npm audit` |
| MFA | passkeys opcionales, no forzadas a ADMIN | Media |
| Secretos en repo | `.env` local no versionado (verificar `.gitignore`) | Alta si se commitea |

---

## Prioridad de implementación derivada

Fase 1 (esta entrega): duplicados/idempotencia, estados de guardado, edición, versión/concurrencia, papelera lógica en entidades duras, bóveda (rotación, auto-hide, auditoría), autorización objeto, errores recuperables, pruebas.

Fase 2: filtros/orden, búsqueda global, a11y, export/backup, móvil, observabilidad.

Fase 3: backlinks, markdown seguro, vistas, plantillas, ADR, colaboración modelada sin activar UI incompleta.
