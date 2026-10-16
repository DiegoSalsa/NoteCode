import {
  archiveQuote,
  convertQuote,
  editQuote,
  reviseQuote,
  transitionQuote,
} from "./quotes";
import { requireCommercial, type Actor } from "./transaction";

export async function quoteCommand(
  id: string,
  body: Record<string, unknown>,
  actor: Actor,
) {
  if (body.action === "revision") return reviseQuote(id, actor);
  if (body.action === "convert")
    return convertQuote(
      id,
      typeof body.projectId === "string" && body.projectId
        ? body.projectId
        : undefined,
      actor,
    );
  if (body.action === "archive") return archiveQuote(id, actor);
  if (typeof body.status === "string") {
    requireCommercial(
      Object.keys(body).every((k) =>
        ["status", "contentHash", "editVersion", "feedback"].includes(k),
      ),
      "Guarda el contenido antes de cambiar el estado.",
      400,
    );
    return transitionQuote(
      id,
      body.status,
      typeof body.contentHash === "string" ? body.contentHash : undefined,
      typeof body.feedback === "string" ? body.feedback : undefined,
      actor,
      typeof body.editVersion === "number" ? body.editVersion : undefined,
    );
  }
  return editQuote(id, body, actor);
}
