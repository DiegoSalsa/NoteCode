# Informe final — auditoría e implementación NoteCode

Fecha: 2026-08-31  
Rama de trabajo: `main` (cambios locales, sin commit automático)  
Conclusión: **APROBADO CON OBSERVACIONES**

No se declara APROBADO porque faltan E2E de navegador, pruebas axe, arrastre persistente en UI, CSP estricta, rate limit distribuido y una restauración de backup ejecutada de punta a punta en un entorno aislado. No quedan fallos de `tsc` ni de las pruebas unitarias ejecutadas.

---

## 1. Resumen ejecutivo

NoteCode ya era un workspace estructurado (proyectos con tareas, requisitos, tecnologías, credenciales, notas y documentos) más un ERP interno. El trabajo de este ciclo no lo convierte en un clon de Notion: refuerza esa estructura y corrige fallos de confiabilidad, edición, bóveda y recuperación.

Se implementó la Fase 1 completa (duplicados, guardado, edición, autorización, bóveda, errores recuperables y pruebas). De la Fase 2 se entregó búsqueda global, papelera, exportación, accesibilidad base, encabezados de seguridad, auditoría con correlación y experiencia móvil ya existente mejorada. De la Fase 3 hay plantillas, ADR, Markdown sanitizado, backlinks, historial de notas y el modelo de miembros sin activar colaboración incompleta.

---

## 2. Diagnóstico inicial

Ver `docs/AUDITORIA-INICIAL.md`. Hallazgos principales:

| Hallazgo | Severidad |
|---|---|
| Formularios de alta sin bloqueo ni idempotencia | Crítica |
| Sin edición de requisitos/tareas/tecnologías/ficha | Alta |
| Tareas/requisitos/tecnologías con borrado físico | Alta |
| Una sola clave de cifrado, secretos persistían en el DOM | Alta |
| Proyectos COMPANY visibles a cualquier usuario autenticado | Alta |
| Casi nula cobertura de pruebas fuera de impuestos | Crítica |
| Sin búsqueda global, export ni papelera usable | Alta |

Línea base previa: `npm test` 9/9 (solo tax), `tsc` OK.

---

## 3. Cambios implementados por fase

### Fase 1 — crítica
- Clave `Idempotency-Key` en altas; reintento concurrente no duplica.
- UI “Guardando…” y campos deshabilitados; confirmación `aria-live`.
- PATCH + UI de edición para requisitos, tareas, tecnologías, ficha de proyecto y metadatos de documentos.
- Concurrencia optimista por `version` (409 si hay conflicto).
- Soft delete + `deletedById` en esas entidades.
- Códigos RF-01 persistidos.
- Cifrado versionado `vN:iv:tag:data`, payload JSON interno de bóveda, auto-ocultado 12s, rate limit de reveal, `type=password`.
- Sesiones emitidas antes de un cambio de contraseña se invalidan.
- Origin check en APIs mutantes; comparación de firma del proxy en tiempo constante.
- Errores en español, datos del formulario se conservan si falla.

### Fase 2 — alta
- Filtros, búsqueda intra-proyecto, vistas tablero/lista/calendario con persistencia.
- Búsqueda global `/buscar` con recortes redactados.
- Papelera `/papelera` y restauración.
- Export JSON/CSV/Markdown; bóveda solo con reauth.
- Encabezados de seguridad, `prefers-reduced-motion`, `:focus-visible`, nombres accesibles en acciones de icono.
- `/api/health`, logs JSON redactados, `correlationId` en auditoría.
- Reordenamiento persistente por API; operaciones masivas con confirmación para borrado.

### Fase 3 — diferenciación
- Plantillas: software, tesis, freelance, personal, lanzamiento, investigación.
- Sección ADR (decisiones) con contexto, alternativas y consecuencias.
- Markdown sanitizado, TOC, `[[enlaces]]`, historial y restauración de versiones.
- Modelo `ProjectMember` (owner/editor/colaborador/lector) **sin UI** para no habilitar colaboración incompleta.
- Importación: solo vista previa.

---

## 4. Archivos y migraciones modificados

Migración: `prisma/migrations-manual/20260831_workspace_integrity.sql` (aplicada en la base configurada).  
Es reversible: columnas nuevas se pueden `DROP`; tablas nuevas se pueden eliminar. No borra filas de usuario.

Documentación: `docs/AUDITORIA-INICIAL.md`, `docs/BACKUP-Y-MIGRACION.md`, `DEPLOYMENT.md`.

---

## 5. Decisiones técnicas

1. Idempotencia con fila de bloqueo (`pending`) para que dos POST simultáneos ejecuten el alta una sola vez.
2. Fallo de una operación con clave borra el registro pendiente para permitir reintento (el formulario no queda bloqueado).
3. AES-256-GCM de Node `crypto` (sin criptografía propia); rotación con `ENCRYPTION_KEY_PREVIOUS`.
4. IDs de nuevas tablas en `TEXT` para alinearlas con el esquema existente.
5. Markdown propio que escapa HTML; no se añadió `marked`/`dangerouslySetInnerHTML` de HTML crudo de usuario.
6. Colaboración modelada, no activada.
7. Importación destructiva deshabilitada hasta que el propietario defina el mapeo Notion/Obsidian → secciones estructuradas.

---

## 6. Matriz de criterios de aceptación

| Funcionalidad | Resultado | Evidencia | Prueba ejecutada | Pendientes |
|---|---|---|---|---|
| Doble clic no duplica | Cumple (backend + UI) | `lib/idempotency.ts`, formularios con `savingAction` | `lib/idempotency.test.ts` concurrente | E2E de clic real en navegador |
| Misma clave devuelve original | Cumple | replay `Idempotency-Replayed` | test replay | — |
| Formulario no queda bloqueado si falla | Cumple | abort de clave + `finally` | test retry after fail | — |
| Contador tras confirmar | Cumple | `fetchAll` después del 201 | revisión de flujo | E2E |
| Edición de registros | Cumple | PATCH + modales | tsc + lectura de rutas | E2E |
| Papelera y restore | Cumple | `/api/trash`, `/papelera` | tsc | E2E restore |
| Bóveda oculta por defecto | Cumple | GET enmascara, auto-hide 12s | crypto tests | verificación visual |
| Búsqueda respeta permisos | Cumple | filtro COMPANY/PERSONAL | revisión de query | prueba cruzada de usuarios en vivo |
| Markdown XSS | Cumple | escape + drop javascript: | `lib/markdown.test.ts` | — |
| Export sin secretos | Cumple | `stripSecretsFromExport` | `lib/export.test.ts` | — |
| Arrastrar y soltar UI | Parcial | API `/reorder` | unit `persistOrder` | UI drag |
| Colaboración | Diferido a propósito | modelo `project_members` | — | decisión del propietario |
| A11y AA completa | Parcial | labels, live region, focus-visible | unit markdown | axe + teclado en todos los modales |
| Backup restaurado | Documentado | política RPO/RTO | helper `backupIsValid` | restore aislado real |

---

## 7. Pruebas ejecutadas y resultados

| Comando | Resultado | Cantidad | Fallos | Tiempo |
|---|---|---|---|---|
| `npm test` (antes) | OK | 9 | 0 | ~5.7s |
| `npm test` (después) | OK | 25 | 0 | ~1.3s |
| `npx tsc --noEmit` | OK | — | 0 | ~4s |
| `npx prisma generate` | OK | — | 0 | ~0.3s |
| `npx prisma db execute ...20260831...sql` | OK (tras ajustar TEXT vs UUID) | — | 0 | ~4s |
| `npm audit --omit=dev` | 6 vulnerabilidades (2 moderate, 4 high) | deepmerge-ts (prisma), nanoid, postcss/next | no se aplicó `audit fix --force` (rompería Prisma 6.19) | |
| `npx next build` | OK | 54 rutas, compile 10.1s, TS 7.3s | 0 | |

No hay ESLint de proyecto ni Playwright.

---

## 8. Auditoría de seguridad

Revisión posterior a los cambios:

Correcciones aplicadas tras la auditoría independiente de seguridad (no estaban en el primer corte):

- Tokens de portal: el GET de clientes ERP ya no descifra `tokenCiphertext` salvo ADMIN/MANAGER.
- Papelera ERP: restaurar exige `role === "ADMIN"`.
- `/api/clients`: sesión en todos los handlers; crear/editar/borrar exige `canManage`.
- Login passkey: deniega perfiles `active: false`.
- Uploads en ficha de proyecto: misma allowlist MIME que documentos globales; `clientVisible` solo con `canManage`.
- Gilberto, transcribe y speak exigen usuario; transcribe limita 8 MB y rate limit.
- Notas globales no se pueden colgar de un `projectId` inaccesible.
- Credenciales de empresa (`projectId` null): listar/crear/editar/borrar/revelar exige `canManage`.
- `APP_URL` obligatorio en producción para enlaces de clave.

- Autorización por objeto: proyectos personales aislados; COMPANY es visible a usuarios autenticados **por decisión de los dos dueños**. Altas de empresa, portales y bóveda sin proyecto siguen exigiendo `canManage`.
- Sesiones: httpOnly, lax, HMAC; invalidación tras cambio de password.
- CSRF: Origin check en mutaciones API + sameSite=lax.
- XSS: React + sanitizer Markdown.
- Inyección: Prisma.
- Archivos: MIME allowlist 12 MB (existente).
- Rate limiting: en memoria por instancia (revelar, buscar, exportar, alta de credencial). En Vercel es débil.
- Secretos: no se devuelven en GET; logs redactan `password`/`token`.
- Bóveda: cifrado versionado, reauth para reveal/export.
- Dependencias: `npm audit --omit=dev` (resultado en la corrida de verificación).
- Enumeración: 404 genérico en recursos ajenos.
- MFA: passkeys opcionales, no forzadas a ADMIN.

Riesgos residuales: ver sección 11.

---

## 9. Auditoría de accesibilidad

- Automática: sanitización y nombres de controles añadidos; no hay axe en CI.
- Manual de código: labels, `aria-label` en Plus/Trash/Eye, `aria-live`, `:focus-visible`, 44px táctil ya existía, `prefers-reduced-motion`.
- Modales nuevos con `role="dialog"`; el componente `Modal` sí atrapa el foco. Los diálogos de la ficha de proyecto aún no usan ese componente.
- No se ejecutó un lector de pantalla real en este entorno.

---

## 10. Auditoría de rendimiento

No hay RUM de producción. Comparativa de herramientas locales:

| Medición | Antes | Después |
|---|---|---|
| `vitest run` | 5.66s / 9 tests | 1.34s / 25 tests |
| `tsc --noEmit` | OK ~7s | OK ~4–5s |
| Payload ficha de proyecto | un GET monolítico | igual (no se partió) |
| Listas | paginadas | paginadas + filtros cliente |

La ficha sigue hidratando operación comercial, tickets y timeline en un solo request: mejora pendiente.

---

## 11. Riesgos pendientes

| Riesgo | Severidad | Nota |
|---|---|---|
| Rate limit in-memory en serverless | Media | Un atacante reparte instancias |
| COMPANY visible a usuarios autenticados | Aceptado | Decisión de los dos dueños. No es un defecto a corregir. |
| Sin CSP estricta | Media | Next.js + inline scripts |
| Passkeys no obligatorias para ADMIN | Media | |
| Drag-and-drop UI ausente | Baja | API lista |
| Restore de backup no ensayado en aislado | Alta operativa | Política documentada, no ejecutada |
| Secretos en notas históricas | Media | Escaneo reporta recuento, no migra solo |
| Colaboración incompleta | — | Modelo listo, UI no |

---

## 12. Trabajo que requiere decisión del propietario

1. ~~¿Los proyectos de empresa deben pasar a Owner/Editor/Colaborador/Lector o seguir abiertos a todo el equipo autenticado?~~ **Resuelto (2026-08-31):** visibles para todos los usuarios autenticados; los dos dueños operan la empresa. No se activa ACL por proyecto. Los proyectos personales siguen privados.
2. ¿Forzar passkey (o segundo factor) para revelar bóveda y para cuentas ADMIN?
3. ¿Migrar notas que el escáner marque como sensibles hacia la bóveda? (opt-in, con respaldo)
4. ¿Activar importación destructiva desde Notion/Obsidian y con qué mapeo?
5. ¿Contratar PITR de Supabase y quién ejecuta el ensayo de restore mensual?
6. ¿Redis/Upstash para rate limit e idempotencia compartida entre lambdas?

---

## 13. Procedimiento de despliegue

1. Configurar env: `ENCRYPTION_KEY` (32 bytes), opcional `ENCRYPTION_KEY_PREVIOUS`, `ENCRYPTION_KEY_VERSION`, `TRASH_RETENTION_DAYS`.
2. Aplicar `prisma/migrations-manual/20260831_workspace_integrity.sql` en el SQL editor o `prisma db execute`.
3. `npx prisma generate`
4. `npx tsc --noEmit` y `npm test`
5. `npx next build` y desplegar Vercel.
6. Comprobar `GET /api/health`.
7. Crear un proyecto de prueba con plantilla “software” y verificar que un doble clic no duplica RF.

---

## 14. Procedimiento de reversión

1. Revertir el deploy de Vercel al commit anterior.
2. No es obligatorio borrar columnas nuevas; el código viejo las ignora.
3. Si hay que revertir esquema: `DROP TABLE` de las tablas nuevas listadas al final del SQL; `DROP COLUMN` de las columnas añadidas. Hacer backup lógico (`GET /api/export`) antes.
4. No ejecutar `DELETE` de `projects`/`notes` como parte del rollback.

---

## 15. Pasos de validación manual

1. Login y passkey.
2. Crear proyecto con plantilla; recargar; no deben duplicarse requisitos.
3. Doble clic en “Agregar tarea”: una sola fila; botón “Guardando…”.
4. Editar requisito RF-01, cancelar, editar de nuevo y guardar.
5. Revelar credencial: texto visible ~12s, luego se oculta; el GET nunca trajo el secreto.
6. Eliminar tarea → aparece en Papelera → Restaurar.
7. Buscar un término de una nota; no deben aparecer passwords.
8. Export JSON: abrir el archivo y confirmar que no hay `password` reales.
9. Móvil: nav inferior, crear requisito, teclado no hace zoom (16px).
10. Teclado: Tab hasta “Agregar requisito”, Enter envía una vez.

---

## 16. Evidencia de que no se expusieron secretos

- No se imprimieron valores de `.env`, `ENCRYPTION_KEY`, ni filas de `secret_data`.
- GET de credenciales sigue devolviendo `************`.
- `lib/redact.test.ts` comprueba que `password` no viaja en JSON de logs.
- Export por defecto elimina el campo de secreto.
- El escaneo de notas solo reporta `{ scanned, flagged }`.

---

## 17. Recomendación del siguiente ciclo

1. Playwright: doble envío, papelería, búsqueda, reveal, teclado.
2. Axe + completar focus trap en todos los diálogos de la ficha.
3. Drag-and-drop que llame `/api/projects/:id/reorder`.
4. Ensayo de restore de Postgres en un proyecto Supabase aparte y marcar `validated_at`.
5. Si el propietario elige RBAC, activar `project_members` con invitaciones con vencimiento.
6. Partir el GET de ficha de proyecto (operación vs núcleo).

---

## Conclusión

**APROBADO CON OBSERVACIONES**

La Fase 1 está implementada y verificada con pruebas unitarias, migración aplicada y TypeScript limpio. Quedan observaciones de seguridad operativa (rate limit, CSP, MFA, restore real) y de producto (colaboración, drag UI, E2E) documentadas, ninguna de ellas oculta.
