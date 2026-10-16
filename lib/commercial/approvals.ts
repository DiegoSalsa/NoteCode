import {
  audit,
  assertPortalActor,
  lock,
  requireCommercial,
  transaction,
  type Actor,
} from "./transaction";
// Deliverable approvals remain distinct from proposal acceptance and never alter prices.
export async function decideApproval(
  id: string,
  status: string,
  feedback: string | undefined,
  actor: Actor,
) {
  requireCommercial(
    ["Aprobado", "Rechazado", "Cambios solicitados"].includes(status),
    "Decisión inválida.",
    400,
  );
  return transaction(async (tx) => {
    await assertPortalActor(tx, actor);
    await lock(tx, "client_approvals", id);
    const approval = await tx.clientApproval.findUnique({
      where: { id },
      include: { project: true },
    });
    requireCommercial(
      approval &&
        !approval.project.deletedAt &&
        approval.project.visibility === "COMPANY" &&
        (actor.origin !== "PORTAL" ||
          (approval.project.clientId === actor.clientId &&
            (!actor.projectId || approval.projectId === actor.projectId))),
      "Aprobación no encontrada.",
      404,
    );
    if (approval.status === status) return approval;
    requireCommercial(
      approval.status === "Pendiente",
      "La aprobación ya tiene una decisión. Solicita una nueva revisión.",
    );
    const result = await tx.clientApproval.update({
      where: { id },
      data: {
        status,
        feedback: feedback?.trim().slice(0, 10_000) || null,
        decidedAt: new Date(),
        decidedBy: actor.name,
      },
    });
    await audit(tx, actor, "DECIDE_DELIVERABLE", "ClientApproval", id, {
      status,
      portalTokenId: actor.portalTokenId ?? null,
    });
    return result;
  });
}
