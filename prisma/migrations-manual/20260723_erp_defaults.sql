INSERT INTO "accounts" ("id", "code", "name", "type", "active", "created_at", "updated_at") VALUES
  (gen_random_uuid()::text, '1.1.01', 'Banco', 'Activo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '1.1.02', 'Cuentas por cobrar', 'Activo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '1.2.01', 'Equipos', 'Activo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '2.1.01', 'Cuentas por pagar', 'Pasivo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '2.1.02', 'IVA débito fiscal', 'Pasivo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '3.1.01', 'Capital', 'Patrimonio', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '4.1.01', 'Ingresos por proyectos', 'Ingreso', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '4.1.02', 'Ingresos recurrentes', 'Ingreso', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '5.1.01', 'Remuneraciones', 'Gasto', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '5.1.02', 'Software y servicios', 'Gasto', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, '5.1.03', 'Gastos administrativos', 'Gasto', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "automation_rules" ("id", "name", "trigger", "action", "config", "active", "created_at", "updated_at") VALUES
  (gen_random_uuid()::text, 'Alertar facturas vencidas', 'Factura vencida', 'Crear notificación', '{}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Alertar tareas vencidas', 'Tarea vencida', 'Crear notificación', '{}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Detectar proyectos inactivos', 'Proyecto inactivo', 'Crear notificación', '{}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Avisar contratos por vencer', 'Contrato por vencer', 'Crear notificación', '{}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Controlar SLA', 'SLA próximo', 'Crear notificación', '{}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Avisar cotizaciones por vencer', 'Cotización por vencer', 'Crear notificación', '{}'::jsonb, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
