export class ConflictError extends Error {
  status = 409;
  constructor(message = "El registro fue modificado en otra sesión. Recarga e inténtalo de nuevo.") {
    super(message);
    this.name = "ConflictError";
  }
}

export function assertVersion(current: number | null | undefined, incoming: number | null | undefined) {
  if (incoming === undefined || incoming === null) return;
  if (current === undefined || current === null) return;
  if (current !== incoming) throw new ConflictError();
}

export function nextVersion(current: number | null | undefined) {
  return (current ?? 1) + 1;
}
