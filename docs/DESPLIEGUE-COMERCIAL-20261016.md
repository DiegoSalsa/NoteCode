# Integración y despliegue comercial — 16 de octubre de 2026

El usuario autorizó expresamente aplicar las migraciones en producción y, posteriormente, integrar y desplegar en main si las comprobaciones son satisfactorias. Este registro actualiza el estado operativo descrito en los informes anteriores; no convierte sus ensayos locales en pruebas sobre staging real.

## Base de datos

Las dos migraciones manuales **ya están aplicadas en producción**:

1. `20261016_unified_commercial.sql`.
2. `20261016_commercial_corrections.sql`.

Se ejecutaron en ese orden, agrupadas en una única transacción SERIALIZABLE, confirmada el 16 de octubre a las 22:19 de Santiago. Los archivos originales no se modificaron. Antes del COMMIT se compararon cantidades y huellas de los campos históricos de doce tablas. Una conexión posterior de solo lectura confirmó las mismas huellas, once triggers habilitados, doce constraints validadas, doce índices válidos y las dieciséis columnas nuevas.

El preflight posterior no encontró mezcla de orígenes ni acuerdos por debajo de obligaciones facturadas. Señaló dos documentos históricos sin vínculo con el modelo nuevo para revisión; no se reclasificaron documentos ni se crearon acuerdos históricos. Los pagos y documentos conservan las protecciones SQL.

Se generó un respaldo custom de recuperación antes de aplicar el SQL, con acceso local restringido, y se comprobaron su listado, descompresión y SHA-256. No se ensayó una restauración de ese respaldo real. El usuario sustituyó explícitamente el ensayo aislado por la aplicación directa; la ausencia de ese ensayo no se presenta como un defecto del código. Respaldo, salida de psql y evidencias privadas quedan en `.test-data/preintegration/production-recovery`, excluidos de Git.

**No volver a ejecutar estas migraciones ni usar prisma db push contra producción.** Son scripts manuales ya ejecutados; este despliegue solo genera el cliente Prisma durante la instalación y publica la aplicación compatible.

## Corrección acotada anterior a la integración

ProjectPortal protegía la carga inicial, pero una acción pendiente todavía podía ejecutar su recarga, mostrar un error o limpiar el indicador de actividad después de cambiar de proyecto. Ahora la carga inicial, las acciones y sus recargas comparten un AbortController asociado a la instancia/proyecto. El cambio de proyecto o desmontaje cancela las solicitudes e impide actualizar datos, errores o actividad desde una operación anterior. Cancelar la solicitud del navegador no se presenta como rollback de una escritura que el servidor ya hubiera confirmado.

La regresión utiliza el componente real y React en Chromium, con respuestas diferidas e interceptadas: acción exitosa pendiente, acción rechazada pendiente y recarga pendiente al cambiar de proyecto, tanto en escritorio como en móvil. El fixture solo existe dentro del navegador de Playwright; no añade rutas de prueba a la aplicación ni dependencias de producto. No cambia esquemas, DTO, contratos de datos, importes ni SQL.

## Validaciones previas

- ESLint real: cero errores; permanecen las 63 advertencias inventariadas en `security/ESLINT-20261016.json`, sin desactivar reglas.
- Typecheck correcto; 115 pruebas unitarias y 32 de integración PostgreSQL aprobadas.
- Preparación local de ambas migraciones e históricos conservados; verify:erp correcto en sus 19 áreas, con rollback de sus fixtures.
- Build de producción Windows y Linux correcto.
- Playwright: 18 pruebas aprobadas, incluidos los seis escenarios nuevos de carrera en escritorio/móvil y los recorridos comerciales, autenticación WebAuthn, documentos, imágenes, SEO e historial de Gilberto.
- Instalación limpia npm ci en Linux x64/glibc 2.39 con Node 24.22.0; npm ls confirma Next 16.4.2, Sharp 0.35.5, Prisma/client 6.19.3 y deepmerge-ts 8.0.2 limitado a Prisma/config. Se ejecutó el Sharp resuelto desde Next, incluidos SVG a PNG y redimensionamiento PNG nativos. Ubuntu/WSL no reproduce por completo la imagen de Vercel: el build de Vercel es la comprobación final del destino.
- npm audit en Windows y Linux: cero vulnerabilidades reportadas; se mantienen los análisis de aplicabilidad y límites del informe de seguridad.

Los logs de esta etapa están en `.test-data/preintegration/deployment`. Los recorridos de navegador se ejecutan exclusivamente con el clúster local de fixtures, sin correos, cobros ni escrituras reales en producción.

## Publicación y comprobación

1. Publicar el parche y sus regresiones en `refactor/flujo-comercial-unificado`; confirmar el preview del mismo HEAD.
2. Confirmar que main no haya avanzado y que la integración pueda ser fast-forward. Publicar en main sin force push ni cambios al checkout original del usuario.
3. Verificar en GitHub el despliegue Vercel asociado al HEAD integrado y el entorno Production. La integración Git existente publica main automáticamente; no se modifican sus ajustes ni se aplica SQL de nuevo.
4. Esperar el estado success del despliegue y comprobar mediante HTTPS la página de acceso, recursos estáticos, optimización de imagen local y rechazo de API privadas sin sesión. No confundir un commit publicado con un despliegue ya disponible.
5. Conservar los identificadores, URL, HEAD y comprobaciones del despliegue final en las evidencias locales de esta etapa y en la entrega al usuario.

## Fallos y recuperación

Si el build falla, comprobar qué versión sigue sirviendo Vercel, corregir el fallo y volver a publicar sin modificar los datos. Si se confirma un defecto del parche del portal, volver al comportamiento de la revisión comercial compatible `1f7012d` mediante un nuevo commit que revierta únicamente ese parche. No hacer force push ni restaurar automáticamente la aplicación precomercial: sus escrituras pueden ser rechazadas por los triggers ya activos.

Los incidentes de datos se resuelven preservando documentos y pagos. Una restauración completa requiere una ventana sin escrituras, una prueba previa en un destino aislado, reposición/revisión de roles y privilegios no incluidos por el dump y conciliación de cualquier movimiento posterior. No eliminar tablas, acuerdos, facturas o pagos como procedimiento automático de rollback. Los dos documentos históricos siguen pendientes de revisión contable trazable.
