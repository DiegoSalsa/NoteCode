# Migración y operación del flujo comercial

## Alcance y compatibilidad

`prisma/migrations-manual/20261016_unified_commercial.sql` sigue el patrón SQL manual del repositorio. Es aditiva, transaccional y tiene un límite de espera de bloqueo de diez segundos. No elimina columnas, cambia tipos Float existentes, deduce IVA, acepta propuestas antiguas ni modifica importes históricos.

Agrega precio neto/IVA iniciales al proyecto, versión de cálculo y captura pública a propuestas, acuerdos, decisiones, hitos de cobro y vínculos de origen en documentos financieros. Los nuevos importes comerciales aceptados e hitos usan Decimal; los cálculos nuevos usan unidades mínimas enteras con BigInt. CLP no admite fracciones; USD/EUR admiten centavos. Los reportes consolidados operan en CLP y no realizan conversión cambiaria; el margen de proyectos en otra moneda queda sin calcular porque los costos por hora no tienen moneda independiente.

Los triggers preservan propuestas publicadas, decisiones, acuerdos, pagos y documentos con pagos/hitos/contratos. Hay índices únicos por acuerdo/propuesta, factura/hito y clave de pago, y un índice parcial de raíz/versión para cálculos nuevos. Este último y los triggers son administrados por SQL: `prisma db push` no sustituye esta migración.

Registros antiguos:

- `Project.agreedAmount` conserva su significado previo y su valor. Sin `saleNetAmount` se muestra una revisión de precio necesaria, no se divide automáticamente por 1,19.
- Las propuestas con `calculationVersion=0` conservan su aritmética. El portal puede registrar su aceptación y observaciones sin generar un acuerdo tributario ni modificar el importe del proyecto. Una revisión revisada y guardada con la política nueva establece el acuerdo facturable.
- Propuestas aprobadas históricas, enlaces cifrados o antiguos no recuperables, revocaciones, documentos y facturas permanecen. El acceso no recuperable se rota explícitamente desde la administración existente.
- El marcador histórico `Pagado` sin movimientos desglosados se conserva para consultar saldos; no se fabrican registros Payment. Un documento con ese marcador también queda protegido.
- Un proyecto ya facturado, o una propuesta vinculada posteriormente a él, exige conciliación antes de preparar nuevos hitos. Si faltan netos históricos, el servicio detiene la planificación para revisión manual. Nunca carga automáticamente de nuevo el total.
- Los documentos recurrentes nuevos usan contrato y período como origen idempotente. Se reconoce el número histórico determinista y se conserva el documento previo sin alterar su identidad.

## Corrección final de orígenes y revisiones

Aplicar después `prisma/migrations-manual/20261016_commercial_corrections.sql`. Esta segunda migración reemplaza la función de protección de proyectos y añade un clasificador y un trigger de origen/límite en facturas. No reescribe datos ni desactiva las protecciones previas de pagos, documentos, decisiones, acuerdos o hitos. El SQL inicial publicado se conserva sin modificaciones.

Antes de aplicar la corrección, ejecutar `20261016_commercial_preflight.sql` sobre el clon restaurado. Es solo lectura y funciona después del SQL inicial, incluso sin las funciones correctivas. Resolver precios inferiores a obligaciones o monedas incompatibles, orígenes mezclados y documentos históricos ambiguos mediante una intervención contable trazable. La migración no corrige ni valida automáticamente todas las filas anteriores: sus triggers controlan escrituras posteriores.

`contractId`, referencias `contract:` y el patrón histórico conjunto `REC-` + `Facturación recurrente: ` separan mantenimiento. Los cobros nuevos recurrentes requieren un contrato explícito; no se admite simular ese origen mediante notas o referencias manuales. El origen histórico de mantenimiento no puede borrarse editando una nota. Los documentos restantes sin origen confirmado reservan presupuesto del desarrollo y se identifican como «Origen por conciliar».

La aceptación y conversión comprueban las obligaciones activas de desarrollo de **todas** las revisiones, con independencia de lo cobrado. Un documento pagado sigue siendo una obligación facturada. Aceptar menos requiere previamente un ajuste formal compatible con la evidencia; no existe un bypass ni se implementó una nota de crédito/DTE en esta entrega. Los cobros recurrentes quedan fuera de ese límite. La comprobación se ejecuta dentro de la transacción serializable y también al cambiar el acuerdo vigente en SQL.

## Ensayo local reproducible

Requiere Node compatible con ESLint 10 (`^20.19.0`, `^22.13.0` o `>=24`), dependencias (`npm ci`), PostgreSQL y Chromium de Playwright (`npx playwright install chromium`). En Windows se usa PostgreSQL 17 instalado en `C:/Program Files/PostgreSQL/17/bin`; `LOCAL_PG_BIN` permite indicar otra instalación. Los procesos de PostgreSQL se arrancan sin ventanas interactivas.

```powershell
npm run test:commercial:db
npm run test:commercial
npm run build
npm run test:e2e
npm run test:commercial:restore
```

El script opera exclusivamente sobre `127.0.0.1:55473`, bases `notecode_commercial_test` y `notecode_commercial_restore`, y verifica que `SHOW data_directory` coincide con `.test-data/postgres` de este checkout antes de recrearlas. No usa `DATABASE_URL` del entorno para seleccionar el servidor a modificar. No copiar archivos `.env` de producción.

Para construir fuera del runner, configurar `DATABASE_URL` y `DIRECT_URL` al URL local anterior, y secretos locales de sesión/cifrado. Playwright los configura automáticamente para el servidor que arranca. Su URL HTTP canónica es `http://localhost:3217`, coherente con la validación de origen de Next; la conexión PostgreSQL sigue en loopback IPv4. No hay bypass de autenticación: las pruebas crean usuarios locales y sesiones firmadas normales.

La preparación crea el esquema exacto del main base `598822865f6c63f389247a0f7be55d60e19c6875`, inserta fixtures históricas y aplica ambos SQL en orden. Antes del segundo SQL crea un acuerdo aceptado, un hito facturado con pago parcial y un documento recurrente pagado sin movimientos. Compara huellas completas de proyectos, propuestas, acuerdos, hitos, facturas y pagos antes y después de la corrección. La restauración usa `pg_dump -Fc` y `pg_restore --exit-on-error` a otra base; compara conteos, huellas del contenido comercial, documentos, pagos y portales, y comprueba que la protección de una factura pagada se ejecuta también después de restaurarla. Artefactos, respaldos, trazas y logs locales están excluidos de Git.

```powershell
node scripts/commercial-test-db.mjs stop
```

## Despliegue posterior, fuera de esta tarea

1. Verificar el esquema real del entorno de destino contra las migraciones manuales previas. Este trabajo no consultó producción ni afirma que coincida con main.
2. Tomar un respaldo completo, con acceso restringido, registrar su checksum y restaurarlo en un clon aislado. Comparar propuestas, líneas, facturas, pagos, documentos, relaciones y accesos, incluidos registros eliminados lógicamente.
3. Ejecutar el preflight y ensayar ambos SQL en ese clon y ejecutar el recorrido comercial. Revisar registros históricos sin IVA explícito, propuestas ambiguas y documentos que ya estaban pagados sin movimientos.
4. Pausar escrituras comerciales y el cron durante la actualización. Aplicar con `psql -X -v ON_ERROR_STOP=1 -f prisma/migrations-manual/20261016_unified_commercial.sql` usando una conexión verificada del entorno previsto y un rol autorizado para crear funciones/triggers. Después aplicar, con las mismas precauciones, `20261016_commercial_corrections.sql`. Si el SQL inicial ya consta aplicado, ejecutar únicamente la corrección pendiente. No volver a aplicar el SQL inicial. Ninguno se ejecutó en producción durante esta tarea.
5. Desplegar la aplicación y el cliente Prisma de la misma revisión, verificar salud, propuestas, portal y documentos históricos y reactivar operaciones. Evitar versiones viejas escribiendo a la vez: sus actualizaciones incompatibles serán rechazadas por los triggers.
6. Confirmar el caso $380.000 netos + $72.200 IVA = $452.200, hitos $226.100/$226.100, contrato independiente de $70.000, pago parcial, revisiones al alza/a la baja y bloqueo de un precio inferior a lo facturado. Confirmar el intento de modificación de documento pagado. Revisar logs y permisos del portal con dos clientes distintos.

No hay SQL de rollback destructivo. Si aún no hubo escrituras nuevas, se puede restaurar el respaldo probado durante una ventana controlada. Si ya existen aceptaciones o pagos posteriores, conservarlos y preparar una corrección hacia adelante; revertir únicamente el código viejo rompería los nuevos contratos de integridad.

Los cálculos de costo de horas siguen usando la tarifa actual del equipo, porque TimeEntry no guarda la tarifa histórica. Se etiqueta esa limitación en la ficha y en reportes; no se reconstruyen costos históricos con datos inventados. Los ajustes o devoluciones de pagos requieren un procedimiento contable formal: el borrado de evidencia queda bloqueado.
