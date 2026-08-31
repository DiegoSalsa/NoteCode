export const EXPORT_FORMAT_VERSION = "notecode.export.v1";

export type WorkspaceExport = {
  manifest: {
    format: typeof EXPORT_FORMAT_VERSION;
    exportedAt: string;
    includeSecrets: boolean;
    scope: "workspace" | "project";
    projectId?: string;
  };
  projects: unknown[];
  notes: unknown[];
  documents: Array<{ id: string; name: string; category: string; mimeType: string; size: number }>;
  requirements: unknown[];
  tasks: unknown[];
  techs: unknown[];
  decisions: unknown[];
  risks: unknown[];
  milestones: unknown[];
  credentials: Array<{ id: string; name: string; username: string; projectId: string | null }>;
};

export function createExportManifest(input: {
  scope: "workspace" | "project";
  projectId?: string;
  includeSecrets: boolean;
}): WorkspaceExport["manifest"] {
  return {
    format: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    includeSecrets: input.includeSecrets,
    scope: input.scope,
    projectId: input.projectId,
  };
}

export function stripSecretsFromExport(payload: WorkspaceExport): WorkspaceExport {
  return {
    ...payload,
    credentials: payload.credentials.map(({ id, name, username, projectId }) => ({
      id,
      name,
      username,
      projectId,
    })),
  };
}

export function toCsv(rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(String(row[header] ?? ""))).join(",")),
  ].join("\n");
}

export function noteToMarkdown(note: { title: string; content: string; tags?: string[] }) {
  const tags = note.tags?.length ? `\ntags: ${note.tags.join(", ")}` : "";
  return `# ${note.title}${tags}\n\n${note.content}\n`;
}
