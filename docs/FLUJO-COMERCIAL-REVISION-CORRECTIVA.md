# Revisión correctiva final — flujo comercial

> El saneamiento posterior de dependencias, sus versiones, advisories y validaciones actualizadas están en [INFORME-SEGURIDAD-20261016.md](security/INFORME-SEGURIDAD-20261016.md). Los resultados de seguridad de este documento corresponden al HEAD histórico indicado abajo.

Fecha: 16 de octubre de 2026. Rama: `refactor/flujo-comercial-unificado`.

Código validado: `5472cca19ef39d73993c53014619886fa4280fe9`. Esta entrega añade después únicamente documentación; el HEAD final publicado se comunica en la entrega y puede verificarse con `git rev-parse HEAD` y `git ls-remote origin refs/heads/refactor/flujo-comercial-unificado`.

Base de esta revisión: `e0c32cd5b2e58ebfe33118afb7caecf056f41010`. `main` y `origin/main` se conservan en `598822865f6c63f389247a0f7be55d60e19c6875`. No se hizo merge, despliegue, conexión a producción ni ejecución SQL en producción. Se trabajó en el worktree comercial, conservando el checkout de trabajo original.

## Correcciones

### Facturación separada por origen

Antes, la emisión de hitos, la planificación del saldo y la aceptación/conversión consultaban todas las facturas del proyecto. Una factura de mantenimiento podía consumir el límite del desarrollo o impedir generar sus hitos por carecer de neto explícito.

Ahora el clasificador compartido `invoice-origin.ts` distingue desarrollo, contrato recurrente y origen por conciliar. Los límites y saldos del desarrollo excluyen contratos, pero consideran documentos de **todas las revisiones anteriores**, no solo del acuerdo actual. Lo histórico sin origen claro reserva presupuesto hasta su revisión formal. Los desgloses separan monedas y preservan el marcador histórico Pagado sin fabricar movimientos.

El origen recurrente se reconoce por `contractId`, referencia `contract:` o el patrón histórico conjunto `REC-` y `Facturación recurrente: `. El SQL usa el mismo criterio. Los documentos recurrentes nuevos requieren contrato explícito: no se puede eludir el límite agregando una referencia manual. No se reescriben facturas antiguas para asignarles origen.

Caso probado expresamente: dos hitos de **$226.100**, acuerdo **$452.200**, mantenimiento independiente **$70.000** emitido antes de aceptar la propuesta. Se conservan los dos hitos y se emiten ambos. Tras pagar mantenimiento: desarrollo facturado $452.200, cobrado $0, pendiente $452.200; recurrente facturado/cobrado $70.000 y pendiente $0. Una revisión a $476.000 permite planificar y emitir solo los $23.800 restantes.

### Revisiones inferiores a obligaciones vigentes

La aceptación y la conversión comprueban, bajo el bloqueo del proyecto y la transacción serializable, que el total aceptado cubra el total facturado vigente de desarrollo, incluidos documentos por conciliar. El límite depende de lo facturado, no del saldo por cobrar: un pago no permite reducir retroactivamente el precio por debajo de la factura.

Una aceptación inválida revierte toda la operación: no crea acuerdo ni decisión, no cambia el acuerdo vigente ni sustituye los hitos anteriores. El control se comparte entre ERP, portal y servicios; el trigger del proyecto impide también cambiar directamente el acuerdo vigente por otro inferior a las obligaciones. La emisión SQL valida origen, cliente, proyecto, moneda, importe/neto/IVA y pertenencia al hito; además vuelve a comprobar el límite del desarrollo.

Con una factura de $226.100 se probó esta secuencia para cada estado **Pendiente, Parcial y Pagado**:

| Revisión neta | Total con IVA | Resultado |
|---|---:|---|
| $150.000 | $178.500 | Rechazada; acuerdo y evidencia intactos |
| $500.000 | $595.000 | Aceptada al alza |
| $300.000 | $357.000 | Aceptada a la baja, sobre lo facturado |
| $190.000 | $226.100 | Aceptada en el límite exacto; sin saldo por planificar |

Se compararon íntegros la factura y todos sus pagos antes y después, y se conservaron el acuerdo y la aceptación originales. Hay regresiones adicionales para conversión sobre un proyecto ya facturado, acceso directo a SQL, rechazo desde ERP y portal, y concurrencia entre reducir precio y emitir el siguiente hito. Solo una de las dos operaciones concurrentes puede prosperar si juntas excederían el nuevo precio.

No se añadió un bypass administrativo ni un mecanismo de nota de crédito. Una reducción bajo obligaciones requiere antes un ajuste contable formal compatible con las protecciones y trazable en la evidencia; el flujo ordinario la bloquea.

### Precio propuesto y aceptado en pantalla

La lista y la ficha usan el mismo modelo/componente de precio. Sin acuerdo aceptado, un precio inicial explícito muestra **Precio propuesto · pendiente de aceptación**, neto, IVA y total. Al aceptar, muestra **Acuerdo aceptado** con la captura aceptada, aunque el precio inicial del proyecto fuera distinto.

Se verificó en navegador de escritorio y móvil: **$380.000 netos + $72.200 IVA = $452.200**, tanto en lista como en ficha, antes y después de aceptar. No aparece Valor acordado $0 en esos casos. Los importes históricos sin desglose conservan una indicación de neto/IVA por confirmar; no se deduce IVA automáticamente. El presupuesto personal mantiene su propia presentación.

## Efectos sobre otros módulos

| Módulo | Resultado de la revisión |
|---|---|
| Portal | Cobros con etiqueta de origen; resumen global de obligaciones por moneda. La aceptación usa la misma protección. El DTO elimina notas, referencias y relaciones internas seleccionadas para clasificar. Se mantienen las pruebas de aislamiento y privacidad. |
| ERP | Rentabilidad y cobrado de desarrollo excluyen mantenimiento; el API entrega desglose por origen/moneda y precio propuesto/aceptado. Se comprobó el resultado con PostgreSQL real. Se reparó `verify:erp`: usaba la antigua relación singular `quote` en Project; ahora verifica `quotes`, un pago parcial y rollback completo. |
| Finanzas | Conserva las facturas de todos los orígenes y su saldo global por moneda, con etiquetas de origen en la lista. Un pago de mantenimiento no aumenta lo cobrado del desarrollo. No se alteran documentos ni pagos para cuadrar resúmenes. |
| Reportes y asistente | El modelo económico compartido excluye recurrentes de facturado/cobrado de desarrollo y devuelve su desglose separado. Los rótulos y las notas explican el criterio. Los flujos globales de caja siguen incluyendo pagos reales de todos los orígenes. |
| Contratos | Se conserva la emisión idempotente por contrato/período, los reintentos y las fechas de facturación. El trigger exige correspondencia de proyecto/cliente y evita un documento simultáneamente recurrente y de hito. El mantenimiento no afecta el presupuesto aceptado de desarrollo. |

## SQL y migración

El SQL inicial publicado se conserva. Se añadió `20261016_commercial_corrections.sql`, para ejecutar **después** de `20261016_unified_commercial.sql`, y un preflight de solo lectura. La guía `FLUJO-COMERCIAL-MIGRACION.md` contiene el orden y la operación de staging.

El ensayo local reconstruyó el esquema del main base, aplicó la primera migración, creó historia aceptada con factura/pago parcial y mantenimiento pagado, y aplicó la corrección. Las huellas completas de proyectos, propuestas, acuerdos, hitos, facturas y pagos quedaron iguales. Los triggers anteriores siguen activos; las regresiones comprueban sus rechazos junto con las nuevas protecciones.

El preflight posterior dio **cero precios inferiores/incompatibilidades de moneda y cero orígenes mezclados** en las fixtures. Identifica aparte los históricos por revisar; no los corrige ni pretende certificar datos de producción.

## Validaciones finales

Ejecutadas con Node 25.2.1, PostgreSQL 17 local en `127.0.0.1:55473` y secretos exclusivamente sintéticos. Los fallos encontrados en la primera pasada se corrigieron y sus comprobaciones se repitieron.

| Comprobación | Resultado final |
|---|---|
| `npm run lint` | **ESLint real**, salida 0: 0 errores, 64 advertencias. Antes ejecutaba solamente `tsc`. |
| `npm run typecheck` | Salida 0, comprobación TypeScript independiente. |
| `npm test` | 111 pruebas aprobadas en 29 archivos; +11 frente a la entrega anterior. |
| `npm run test:commercial` | 32 pruebas aprobadas contra PostgreSQL real; +8 frente a la entrega anterior. |
| `npm run test:coverage` | 111 aprobadas. Líneas 70,40%; sentencias 66,41%; ramas 54,96%; funciones 70,18%. Es cobertura unitaria, no cobertura de toda la aplicación ni de integración. |
| `npm run verify:erp` | Salida 0; 19 áreas verificadas, asiento equilibrado por $1.000 y rollback completo. |
| `npm run build` | Salida 0, compilación Next y TypeScript correctos. |
| `npm run test:e2e` | 8 aprobadas: 4 escritorio y 4 móvil; precio propuesto/aceptado en ambas vistas y revisión visual de capturas. |
| Preparación SQL + preflight | Salida 0; migración desde baseline, actualización con historia existente y huellas conservadas. |
| `npm run test:commercial:restore` | Salida 0; respaldo/restauración con conteos y huellas coincidentes, y protección de factura pagada tras restaurar. |
| `npx prisma validate` | Salida 0; esquema válido. |
| `git diff --check origin/main..HEAD` | Salida 0. |
| `npm audit --json` | Salida 1: **20 vulnerabilidades** (1 crítica, 7 altas, 6 moderadas, 6 bajas). El lockfile del HEAD anterior da los mismos 20 resultados. No se considera una validación aprobada. |

Última restauración: 80 proyectos, 107 propuestas, 49 facturas, 21 pagos, 63 acuerdos, 70 decisiones y 38 tokens de portal. Los conteos corresponden solo a fixtures locales acumuladas. Se compararon además documentos, líneas, hitos y logs de acceso.

ESLint usa reglas recomendadas de JavaScript/TypeScript y reglas de hooks. Las reglas de variables sin uso, `any` y dependencias de efectos informan advertencias; las reglas de corrección permanecen como errores. No sustituye TypeScript ni constituye una auditoría de seguridad. Configuración: `eslint.config.mjs`, basada en la [documentación oficial de typescript-eslint](https://typescript-eslint.io/getting-started/). ESLint 10 requiere Node `^20.19.0`, `^22.13.0` o `>=24`.

Logs verificables: `.test-data/validation-*.log`; auditorías de dependencias actual y base: `.test-data/npm-audit.json` y `.test-data/npm-audit-baseline.json`. Capturas y trazas: `test-results/`; cobertura: `coverage/coverage-summary.json`. Estos artefactos locales están excluidos de Git; las pruebas y scripts sí quedan versionados.

## Riesgos y condiciones para un merge seguro

1. **Resolver o evaluar y aceptar expresamente las vulnerabilidades antes de autorizar merge/despliegue.** Next figura con severidad crítica; Prisma y otras dependencias tienen hallazgos altos. No se actualizó a ciegas el stack ni se ejecutó `npm audit fix --force`. Que fueran preexistentes no las vuelve inocuas. Los avisos exactos están en los JSON de auditoría; por ejemplo, [aviso de Next para servidores Windows](https://github.com/advisories/GHSA-p293-qw3h-jr36).
2. Restaurar un respaldo real en staging, verificar el esquema y ejecutar preflight y ambos SQL pendientes en orden. El ensayo local no certifica el estado real ni sanea infracciones anteriores. Revisar origen, moneda, neto e IVA de los históricos ambiguos con el responsable contable.
3. Revisar con el responsable de base de datos los triggers y el procedimiento. Programar una ventana con escrituras comerciales/cron detenidos y desplegar aplicación y SQL compatibles; no mantener escritores antiguos simultáneos. `prisma db push` no instala estas protecciones.
4. Mantener bloqueada cualquier reducción por debajo de lo facturado hasta que exista un ajuste formal registrado. No hay emisión DTE/SII, devoluciones ni notas de crédito automáticas. No se probaron servicios externos reales.
5. Revisar las 64 advertencias ESLint según la política del repositorio. Las pruebas no demuestran ausencia total de errores; la cobertura declarada es limitada y el recorrido móvil usa emulación Chromium.
6. El costo de horas usa tarifas actuales y los costos del proyecto no están repartidos por contrato/desarrollo. El margen muestra neto de desarrollo menos costos registrados del proyecto; no representa rentabilidad separada de mantenimiento. No hay conversión cambiaria.

Commits de esta revisión: `500416a` (corrección de negocio, SQL y regresiones) y `5472cca` (ESLint real y correcciones detectadas). El commit documental posterior registra este informe. La publicación se realiza en la misma rama sin modificar main.
