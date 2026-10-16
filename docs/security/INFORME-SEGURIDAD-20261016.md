# Saneamiento de dependencias y seguridad — 16 de octubre de 2026

Rama: `refactor/flujo-comercial-unificado`. Base revisada: `39484fe593709a185d9775c859da9dbdad7db9a6`. Código validado: `c08ecd296ab78049925e91da72ee6d1483619726`; el commit posterior solo documenta esta entrega. El HEAD remoto final se entrega en la respuesta y se verifica con `git ls-remote origin refs/heads/refactor/flujo-comercial-unificado`.

`main` y `origin/main` se mantienen en `598822865f6c63f389247a0f7be55d60e19c6875`. No se hizo merge, despliegue ni conexión a bases reales. Las migraciones solo se ensayaron en el clúster dedicado local de fixtures, nunca sobre producción ni un respaldo real de staging.

## Resultado y alcance de la recomendación

La auditoría pasó de **20 paquetes afectados** —1 crítico, 7 altos, 6 moderados y 6 bajos— a **0**, tanto después de la instalación limpia como en la comprobación final. No son 20 CVE independientes: varios paquetes heredan el mismo advisory. Se verificaron además tres advisories oficiales de Next.js del 14 de octubre que no figuraban en la salida inicial de `npm audit`.

Recomiendo continuar hacia el merge **condicionado al ensayo del respaldo real en staging**, la revisión de los históricos comerciales y la validación del artefacto en su sistema operativo de destino. Se resolvió el bloqueo conocido de dependencias; esta revisión no certifica seguridad absoluta ni autoriza desplegar. El ensayo de staging continúa como un requisito separado.

El análisis reproducible de paquete, versión anterior/posterior, severidad, advisory, rangos, primer parche y aplicabilidad está en [DEPENDENCY-AUDIT-20261016.json](DEPENDENCY-AUDIT-20261016.json). Fuentes: registro npm, advisories del mantenedor y GitHub Advisory Database, consultados con corte al 16 de octubre de 2026. Se conservaron localmente los documentos fuente y las auditorías completas. El JSON versionado incluye también todas las versiones y variantes de plataforma cambiadas en el lockfile.

## Versiones efectivamente instaladas

`npm ci` terminó con salida 0 y ejecutó `prisma generate` 6.19.3. Tanto `npm ls --all` como la consulta dirigida de todas las dependencias modificadas terminaron con salida 0, sin problemas en las dependencias activas.

| Paquete/cadena | Anterior | Instalado | Severidad inicial y corrección |
|---|---:|---:|---|
| next | 16.2.11 | **16.4.2** | Crítica; versión estable posterior a los parches de octubre |
| sharp | 0.35.3 | **0.35.5** | Alta en Sharp, crítica en el contexto del endpoint Next; eliminado el override antiguo |
| @prisma/client / prisma / @prisma/config | 6.19.3 | **6.19.3** | Prisma/config heredaban aviso alto del merger; se conserva el ORM |
| deepmerge-ts, solo bajo @prisma/config@6.19.3 | 7.1.5 | **8.0.2** | Alta; override acotado y compatibilidad comprobada |
| @simplewebauthn/server | 13.3.1 | 13.3.3 | Baja; primer parche 13.3.2 |
| ai | 6.0.208 | 6.0.309 | Baja heredada de provider-utils/gateway |
| @ai-sdk/deepseek | 2.0.39 | 2.0.76 | Baja heredada |
| @ai-sdk/react | 3.0.210 | 3.0.312 | Baja heredada |
| @ai-sdk/gateway | 3.0.133 | 3.0.217 | Baja heredada |
| @ai-sdk/provider-utils | 4.0.30 | 4.0.61 | Baja; primer parche de esta rama 4.0.33 |
| postcss | 8.5.22 | 8.5.30 | Moderada; primer parche 8.5.23 |
| @tailwindcss/postcss | 4.3.1 | 4.3.3 | Moderada heredada de PostCSS |
| vitest / @vitest/mocker / @vitest/coverage-v8 | 4.1.10 | 4.1.12 | Moderada; primer parche 4.1.11 |
| baseline-browser-mapping | 2.10.37 | 2.11.29 | Moderada; primer parche 2.11.0 |
| browserslist | 4.28.2 | 4.29.3 | Alta; primer parche 4.28.7 |
| nanoid | 3.3.16 | 3.3.20 | Alta; primer parche de la rama 3.x: 3.3.18 |
| source-map-js | 1.2.1 | 1.2.2 | Alta; primer parche 1.2.2 |
| react / react-dom | 19.1.1 | **19.1.10** | Actualización parche coordinada con RSC/Next; rango ~19.1.10 para mantener la rama |
| tailwindcss | 4.3.1 | 4.3.3 | Coordinado con su plugin PostCSS |

No se ejecutó `npm audit fix --force` ni se migraron indiscriminadamente versiones mayores. Next permanece en 16, React en 19.1, SDK de IA en sus ramas actuales, Vitest en 4 y Prisma en 6. La única transición mayor transitiva es el merger 8.0.2, limitada al consumidor comprobado.

El primer intento con npm 11.6.2 detectó metadata incompleta de dependencias opcionales WASM del lockfile. Se regeneró únicamente esa metadata con `npm@11.21.1`, sin actualizar npm global. Después se repitieron el `npm ci` ordinario con npm 11.6.2 y `npm ls --all`: ambos correctos. No se arregló el árbol borrando paquetes a mano ni omitiendo las dependencias opcionales; Sharp nativo permanece instalado y probado.

## Next.js, Sharp y advisories fuera de npm audit

Se consultaron 72 entradas del índice público de seguridad de Next.js y se cruzaron los rangos con las fichas revisadas. Algunas fichas del mantenedor conservan rangos abiertos y parches provisionales `16.3.?`; se resolvieron con la entrada revisada de GitHub Advisory Database. Las once entradas aplicables al Next 16.2.11 instalado quedan fuera del rango afectado al pasar a 16.4.2.

| Advisory | Severidad | Primer parche 16.x | Aplicabilidad observada antes del cambio |
|---|---|---|---|
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) | Crítica | 16.3.3 | RCE en servidores Windows; host local Windows, destino real aún por verificar |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | Crítica | 16.3.3 | Optimización AVIF; endpoint incorporado existe aunque las vistas actuales no importen next/image |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | Crítica | 16.3.6 | ImageResponse/next/og; sin uso explícito encontrado en el producto |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) | Alta | 16.3.8 | SSRF de Image Optimization; no se configuran remotos y se comprobó su rechazo |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) | Baja | 16.3.8 | Endpoint MCP de next dev; riesgo del entorno de desarrollo, no del servidor next start |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | Moderada | 16.3.8 | Envenenamiento SSG/ISR Pages Router; repositorio usa App Router |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | Moderada | 16.3.8 | Sustitución de caché SSG/ISR Pages Router; exposición observable limitada por el router usado |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) | Moderada | 16.3.8 | Rutas de imágenes de metadatos App Router; sin implementación explícita encontrada |
| [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), 14/10 | **Crítica** | **16.4.1** | SVG/librsvg en Linux glibc. SVG/remotos no habilitados; no se presume exento el futuro artefacto Linux |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), 14/10 | **Crítica** | **16.4.1** | use cache con múltiples typed arrays; no se encontró use cache ni Cache Components activados |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), 14/10 | **Alta** | **16.4.1** | Server Actions en App Router: superficie utilizada por el producto |

El [advisory SVG de Next](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) exige Sharp **>=0.35.5** como solución alternativa. El antiguo override fijaba 0.35.3 e impedía cumplirlo. Se eliminó: Next 16.4.2 declara Sharp `^0.35.5`, y su resolución efectiva es 0.35.5. La elección de [16.4.2 estable](https://github.com/vercel/next.js/releases/tag/v16.4.2), publicada el 15/10, conserva los parches de 16.4.1 y suma correcciones de Turbopack.

Sharp tenía además [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), libheif, corregido en 0.35.4, y [GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w), librsvg/CVE-2026-96889, corregido en 0.35.5. Se cargó **el Sharp resuelto desde Next**, se decodificaron SVG y PNG benignos con la biblioteca nativa y se comprobó el endpoint HTTP de optimización PNG. No se ejecutaron exploits ni pruebas de consumo destructivo.

Los avisos relacionados de React [RSC RCE](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) y [Server Functions DoS](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453) se revisaron junto con la actualización del framework. No hay dependencia directa react-server-dom-* en el manifiesto; Next incorpora su implementación. Se actualizaron también React y React DOM a 19.1.10. La evidencia de parche del RSC incorporado es la versión oficial de Next, no la sola versión de React cliente.

## Prisma y demás cadenas transitivas

**Prisma/config/deepmerge-ts.** Los tres avisos altos procedían de [GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx). Requiere grafos JavaScript cíclicos, condición que JSON ordinario no produce. Se encontró el consumo en la carga de configuración CLI mediante c12; no existe prisma.config en el producto ni un flujo de solicitudes web hacia ese merger. La propuesta automática de auditoría era Prisma 7.10.1, pero implicaba migración mayor del ORM.

Se conservó cliente/CLI/engines 6.19.3 y se añadió exclusivamente `@prisma/config@6.19.3 -> deepmerge-ts 8.0.2`. Se revisaron los [cambios de 8.0.0](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0): cambian Maps, tipos y deepmergeInto; el consumidor observado usa deepmerge con configuración ordinaria. Se probaron mezcla de registros, grafo cíclico, carga real de un prisma.config temporal, generación de cliente, schema validate, migración local, consultas/transacciones PostgreSQL y restauración. Es una excepción de compatibilidad mantenida por el repositorio, no un backport oficial de Prisma; requiere revisión en futuras actualizaciones y debe retirarse al adoptar una versión del consumidor con el parche nativo.

**IA.** [GHSA-866g-f22w-33x8](https://github.com/advisories/GHSA-866g-f22w-33x8) afecta handlers HTTP que consumen respuestas sin un límite compartido. Gilberto usa DeepSeek y estos handlers, por lo que se actualizó la cadena completa dentro de sus majors. El endpoint de proveedor es fijo; el usuario no proporciona una URL de proveedor. Gateway se instala transitivamente, aunque no se use para elegir el modelo. Las pruebas simulan respuestas de DeepSeek y comprueban argumentos/herramientas, resultado comercial y protocolo SSE/UI. No validan credenciales, disponibilidad ni calidad del servicio externo real.

**WebAuthn.** [GHSA-6hxq-p678-4hr2](https://github.com/advisories/GHSA-6hxq-p678-4hr2) afecta la confianza en la cadena de certificados de attestation. El registro actual pide attestation none y no establece confianza de fabricante/MDS, lo que limita ese escenario específico. Se aplicó el parche igualmente y se probó registro criptográfico, ingreso firmado y rechazo de replay con autenticador virtual.

**CSS/mapas/build.** [PostCSS](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [Browserslist memoria](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [Browserslist stats](https://github.com/advisories/GHSA-73wf-gq98-2v4g), [baseline-browser-mapping](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) y [nanoid](https://github.com/advisories/GHSA-2v37-7h3g-55p8) se parchearon sin salto mayor. Su superficie observable es principalmente construcción/pruebas: no se procesa CSS, sourcemaps, stats ni tamaños customRandom de visitantes en runtime. Esa limitación no elimina la amenaza en CI ante fuentes/PRs no confiables. Se mantiene el override PostCSS `$postcss` para impedir copias transitivas antiguas.

**Vitest/mocker/coverage.** [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) permite lectura arbitraria mediante el plugin público de mocks en un servidor de desarrollo accesible. No hay servidor HMR de Vitest público ni plugins de ese tipo en runtime. Se actualizaron coordinadamente las tres dependencias a 4.1.12 y se repitieron pruebas y cobertura.

No quedó en este alcance una vulnerabilidad conocida sin parche disponible: todas las cadenas afectadas del snapshot se corrigieron. Se siguen recomendando CI y servidores de desarrollo aislados, acceso mínimo a secretos, monitoreo de advisories y comprobación de paquetes dentro del artefacto desplegable.

## Validación final

| Comprobación | Resultado |
|---|---|
| npm ci, npm 11.6.2 / Node 25.2.1 | Salida 0, postinstall Prisma correcto |
| npm ls --all y consulta dirigida de versiones | Salida 0 en ambas |
| npm audit --json | Salida 0; 20 → 0 paquetes afectados |
| Advisories oficiales Next hasta 16/10 | 11 rangos aplicables a la base, ninguno al 16.4.2 instalado; incluidos los tres de 14/10 |
| npm run lint | Salida 0; **0 errores y 63 advertencias**, antes 64 |
| npm run typecheck | Salida 0 |
| npm test | **115 aprobadas**, 30 archivos; incluye cuatro regresiones de dependencias |
| npm run test:commercial | **32 aprobadas**, PostgreSQL real dedicado local |
| npm run verify:erp | Salida 0; 19 áreas, asiento equilibrado, rollback completo |
| npm run build | Salida 0; Next 16.4.2 y compilación TypeScript |
| npm run test:e2e | **12 aprobadas**, seis casos por escritorio/móvil Chromium |
| npm run test:coverage | 115 aprobadas; líneas 70,40%, sentencias 66,41%, ramas 54,96%, funciones 70,18% de la instrumentación unitaria |
| npx prisma validate | Salida 0, esquema válido |
| Preparación SQL local / respaldo y restauración | Correctos, huellas comerciales conservadas y protecciones activas tras restaurar |
| git diff --check | Sin errores |

Los recorridos cubren autenticación ausente/falsificada/caducada, intento de bypass con header de middleware, CSRF, registro/login WebAuthn y replay, portal aislado y revocado, propuesta/revisión/edición/publicación/aprobación, facturación y pago parcial, documentos públicos/privados y descarga idéntica byte a byte, rechazo de HTML, optimización local de imágenes/rechazo de remoto, SEO y navegación, e historial de Gilberto aislado entre usuarios. La ejecución de herramientas y el streaming del proveedor se comprobaron con transporte simulado en las pruebas unitarias. La arquitectura comercial y sus funcionalidades se conservaron.

Los primeros fallos de instalación y de los nuevos tests se corrigieron y se repitieron las validaciones. Las correcciones de los tests fueron selección de export/tipo de Sharp, ruta real de descarga y selector de mensaje frente a una opción homónima del selector de conversaciones; no se cambiaron endpoints para hacerlos pasar.

Artefactos locales: `.test-data/security/npm-ci.log`, `installed-versions.log`, `npm-ls-all.log`, `audit-before.json`, `audit-after.json`, `next-review.json`, `validation-*.log` y `validation-results.json`; `test-results/`, `playwright-report/` y `coverage/`. No contienen credenciales reales y están excluidos de Git. Los JSON resumidos del inventario y las advertencias quedan versionados junto con las pruebas.

## Advertencias ESLint

Se mantuvieron todas las reglas. La advertencia del panel ProjectPortal reveló una carrera: una consulta antigua podía sustituir los enlaces al cambiar de proyecto. Se estabilizó la función de carga y se cancelan/ignoran respuestas antiguas con AbortController; se limpia el estado al cambiar el proyecto. Es el único cambio de producto de esta etapa.

Quedan **35 variables/imports/argumentos sin uso, 25 tipos any y 3 advertencias de dependencias de hooks**. El inventario exacto, con archivo/línea/mensaje, está en [ESLINT-20261016.json](ESLINT-20261016.json). Los any están en DTO/vistas SEO y ensamblaje de resultados derivados de consultas autorizadas; limitan el análisis estático y requieren una limpieza tipada posterior. Los símbolos sin uso incluyen restos de utilidades sustituidas, imports, errores capturados deliberadamente y argumentos de iteración; no se encontró otra pérdida de ejecución necesaria asociada a esas advertencias.

Las tres advertencias de hooks restantes se revisaron individualmente:

- Correos: recarga al cambiar la pestaña; la búsqueda es explícita. Añadir sin memoización la función a las dependencias dispararía recargas por render y cambiaría esa semántica.
- Gilberto: la función de voz usa voz seleccionada y activación de voz; ambos valores ya figuran en el efecto. Sus setters y refs son estables. Sigue pendiente expresar esa relación mediante un callback estable.
- TodayWorkspace: dependencia data innecesaria en useCallback; el efecto comprueba si faltan datos antes de cargar. Es redundancia de identidad, sin un bucle de solicitudes observado.

Este inventario no declara inocuo todo uso futuro de any ni sustituye revisión de código. No se silenció una regla para reducir el contador.

## Contratos, SQL y riesgos pendientes

No cambió el esquema Prisma, los modelos persistidos, los DTO comerciales ni las dos migraciones. Se compararon bytes y SHA-256 anteriores/posteriores; las huellas están versionadas en el JSON de auditoría. La preparación local reconstruyó baseline → migración unificada → historia facturada → corrección, y conservó el contenido histórico durante la actualización. La restauración final comparó 96 proyectos, 123 propuestas, 57 facturas, 25 pagos, 71 acuerdos, 82 decisiones y 46 tokens, además de documentos/hitos/líneas/logs. Son solo fixtures locales acumuladas.

Condiciones pendientes antes de integrar y desplegar:

1. Ensayar por separado sobre un **respaldo real de staging**, revisar preflight, esquema e históricos y aprobar el procedimiento de las dos migraciones. Nada en esta tarea sustituye ese requisito ni modifica los SQL ya revisados.
2. Construir e instalar con el lockfile en el SO/runtime de destino, comprobar allí `npm ls next sharp`, Sharp/libvips nativos y optimización de imágenes. El ensayo actual fue Windows; no certifica los binarios Linux/glibc. Repetir auditoría al momento de integrar por posibles avisos nuevos.
3. Mantener y revisar el override de Prisma/config/deepmerge-ts; la transición de Maps de 8.x requiere atención si se incorpora configuración nueva que use Maps o APIs de mezcla distintas.
4. Validar en staging las integraciones externas autorizadas: DeepSeek, voz, Google/SEO y Storage. Se probó su lógica local y protocolos simulados, sin utilizar credenciales reales ni enviar correos, cobrar o ejecutar llamadas reales a esos proveedores.
5. Mantener los límites operativos ya documentados: datos históricos por conciliar, costos a tarifa actual, ausencia de DTE/ajustes contables automáticos y coordinación de aplicación/SQL durante despliegue.

Commits de código: `e29aef6` (dependencias y regresiones) y `c08ecd2` (carrera del portal). El HEAD remoto final incluye únicamente documentación adicional y se entrega tras comprobar la publicación en la misma rama.
