export const BACKUP_POLICY = {
  rpoHours: 24,
  rtoHours: 4,
  retentionDays: 30,
  validationCadenceDays: 30,
  includeSecretsByDefault: false,
  notes: [
    "Una copia no es válida hasta restaurarla en un entorno aislado y comprobar integridad.",
    "El export JSON versionado es el respaldo lógico de aplicación. El respaldo físico de Postgres lo cubre Supabase PITR si está activo.",
    "La bóveda se exporta solo con reauth y flag includeSecrets.",
  ],
};

export function backupIsValid(input: { validatedAt: Date | string | null; createdAt: Date | string }) {
  if (!input.validatedAt) return false;
  const validated = new Date(input.validatedAt).getTime();
  const created = new Date(input.createdAt).getTime();
  return Number.isFinite(validated) && validated >= created;
}
