# Respaldo, restauración y migración

## Política

| Ítem | Valor propuesto |
|---|---|
| RPO | 24 horas |
| RTO | 4 horas |
| Retención de papelera | 30 días (`TRASH_RETENTION_DAYS`) |
| Retención de logs | 30 días (configurar en el proveedor) |
| Secretos en export | no, salvo `includeSecrets=1` + passkey |

Una copia no se considera válida hasta restaurarla y comprobar que proyectos, notas y requisitos coinciden.

## Exportación

- Espacio completo: `GET /api/export` → JSON `notecode.export.v1`.
- Un proyecto: `GET /api/export?scope=project&projectId=<id>`.
- Notas Markdown: `GET /api/export?format=markdown`.
- Tareas CSV: `GET /api/export?format=csv`.
- Bóveda: `GET /api/export?includeSecrets=1` (reauth WebAuthn).

## Restauración ante borrado accidental

1. Abrir **Papelera**.
2. Restaurar el elemento.
3. Las referencias se conservan porque la eliminación es lógica.

Eliminación definitiva: `DELETE /api/trash` con `{ "confirm": "ELIMINAR" }` y rol ADMIN/MANAGER.

## Corrupción o pérdida de Postgres

1. Restaurar el backup de Supabase (PITR si está activo) a un proyecto aparte.
2. Apuntar `DIRECT_URL` al entorno de prueba.
3. Ejecutar `GET /api/health`.
4. Importar o comparar un export JSON tomado antes del incidente.
5. Solo entonces promover el restore.

## Migración desde herramientas externas

- **Notion/Obsidian → NoteCode:** exportar Markdown/CSV, crear un proyecto con plantilla, pegar notas (se sanitiza Markdown) y cargar requisitos como CSV luego de mapear columnas `code,description,priority`.
- **NoteCode → otros:** usar JSON versionado o Markdown de notas. Los secretos no viajan en el export por defecto.

La importación con vista previa completa desde Notion/Obsidian queda como trabajo de propietario: hay que decidir el mapeo de bases de datos Notion a secciones estructuradas de NoteCode, no a páginas libres.
