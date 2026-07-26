# Gilberto Personal OS

## Estado implementado

- DeepSeek `deepseek-v4-pro` como modelo por defecto, con errores seguros y trazabilidad del proveedor.
- Conversaciones persistentes por usuario, selector de conversaciones y memoria explícita no sensible.
- Cola durable de acciones con riesgo, aprobación/rechazo y auditoría.
- Centro **Hoy** con prioridades, cobros, alertas, rutinas y proyección F29.
- Rutinas autónomas de resumen diario y monitor tributario:
  - heartbeat cada 15 minutos mientras la app está abierta;
  - ejecución al volver a una pestaña visible;
  - endpoint cron protegido por `CRON_SECRET` para ejecución con la app cerrada.
- Perfil tributario chileno, documentos tributarios, períodos F29 y cálculo compartido entre UI y Gilberto.
- Validación chilena de RUT, fechas en `America/Santiago`, IVA, PPM, remanente y retención de honorarios versionada.
- Validaciones estrictas, permisos y auditoría reforzados en facturas y documentos.
- Integridad documental por SHA-256, bloqueo de duplicados, MIME permitido y descarga solo de documentos activos.

## Datos verificados de PUROCODE SPA

- RUT: `78.414.103-9`.
- Inicio de actividades: 28-05-2026.
- Categoría: Primera.
- Contribuyente afecto a IVA.
- Segmento SII: Micro Empresa.
- Tasa PPM confirmada por F29: 1%.
- El régimen tributario específico sigue pendiente de confirmación; no se infiere.

## Conciliación actual

### Junio 2026 — oficial

- IVA determinado: $4.788.
- PPM: $252.
- Total F29 declarado y pagado: $5.040.
- Folio F29: 9167599926.
- Fecha de presentación: 20-07-2026.
- La app conserva el formulario y la declaración de inicio en Documentos / Tributario.

### Julio 2026 — estimación interna

- Ventas netas operativas: $168.059.
- IVA débito: $31.931.
- PPM al 1%: $1.681.
- Total estimado: $33.612.
- Vencimiento configurado: 20-08-2026.
- Confianza baja hasta importar RCV, confirmar compras, remanente y propuesta SII.

## Siguientes integraciones prioritarias

1. Importador RCV desde CSV/XLSX del SII con conciliación por folio, RUT y monto.
2. Ingesta de DTE/XML y clasificación automática de IVA recuperable/no recuperable.
3. Flujo de cierre F29: preparar, revisar, comparar con SII, aprobar, declarar y registrar pago.
4. Confirmación del régimen tributario y reglas específicas de PPM/remanentes.
5. Calendario y correo reales para agenda, recordatorios y seguimiento, manteniendo aprobación obligatoria para envíos externos.
6. Integración bancaria de solo lectura para conciliación de pagos y flujo de caja.
7. Backups automáticos, restauración probada y monitoreo de errores/latencia en producción.

## Operación segura

- Reversible e interno: Gilberto puede ejecutar una orden directa.
- Externo, sensible o difícil de revertir: queda en aprobación.
- Credenciales, API keys y contraseñas nunca se guardan en memoria conversacional.
- F29 siempre distingue cálculo interno de declaración oficial.
- Para autonomía con la app cerrada, configurar un cron externo que invoque `GET /api/automations/run` con `Authorization: Bearer $CRON_SECRET`.

## Verificación

- Pruebas unitarias de RUT, IVA/F29 y fechas chilenas.
- TypeScript sin errores.
- Build de producción exitoso.
- Auditoría de dependencias sin vulnerabilidades conocidas.
- Pruebas E2E reales: login, F29 junio/julio, DeepSeek V4 Pro, herramientas financieras, memoria persistente, conversaciones, cola de acciones, rutinas autónomas, carga/descarga documental y bloqueo de duplicados.
