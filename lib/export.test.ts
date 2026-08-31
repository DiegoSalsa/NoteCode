import { describe, expect, it } from "vitest";
import { backupIsValid } from "@/lib/backup-policy";
import { createExportManifest, noteToMarkdown, stripSecretsFromExport, toCsv, EXPORT_FORMAT_VERSION } from "@/lib/export";

describe("export and backup helpers", () => {
  it("omits secrets from the default export payload", () => {
    const manifest = createExportManifest({ scope: "workspace", includeSecrets: false });
    expect(manifest.format).toBe(EXPORT_FORMAT_VERSION);
    const stripped = stripSecretsFromExport({
      manifest,
      projects: [],
      notes: [],
      documents: [],
      requirements: [],
      tasks: [],
      techs: [],
      decisions: [],
      risks: [],
      milestones: [],
      credentials: [{ id: "c1", name: "db", username: "app", projectId: null, password: "nope" } as never],
    });
    expect(JSON.stringify(stripped)).not.toContain("nope");
    expect(stripped.credentials[0]).toEqual({ id: "c1", name: "db", username: "app", projectId: null });
  });

  it("serializes csv and markdown and rejects unvalidated backups", () => {
    expect(toCsv([{ code: "RF-01", title: "Login" }])).toContain("RF-01");
    expect(noteToMarkdown({ title: "Acta", content: "hola", tags: ["x"] })).toContain("# Acta");
    expect(backupIsValid({ createdAt: "2026-01-01", validatedAt: null })).toBe(false);
    expect(backupIsValid({ createdAt: "2026-01-01T00:00:00.000Z", validatedAt: "2026-01-01T01:00:00.000Z" })).toBe(true);
  });
});
