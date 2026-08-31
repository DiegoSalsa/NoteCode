const INTERNAL_LINK = /^(\/|notecode:|#)/;
const SAFE_HREF = /^(https?:|mailto:|\/|notecode:|#)/i;

export type MarkdownBlock =
  | { type: "h"; level: number; text: string; id: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; text: string }
  | { type: "quote"; text: string };

export type MarkdownDocument = {
  html: string;
  toc: Array<{ id: string; level: number; text: string }>;
  links: Array<{ type: "note" | "project" | "requirement" | "task" | "url"; target: string; label: string }>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "seccion";
}

function parseWikiTarget(raw: string): { type: MarkdownDocument["links"][number]["type"]; target: string; label: string } {
  const [target, label] = raw.split("|").map((part) => part.trim());
  const display = label || target;
  if (target.startsWith("proyecto:") || target.startsWith("project:")) {
    return { type: "project", target: target.split(":")[1] ?? target, label: display };
  }
  if (target.startsWith("rf-") || target.startsWith("requisito:")) {
    return { type: "requirement", target: target.replace(/^requisito:/, ""), label: display };
  }
  if (target.startsWith("tarea:")) {
    return { type: "task", target: target.slice(6), label: display };
  }
  if (/^https?:/i.test(target)) {
    return { type: "url", target, label: display };
  }
  return { type: "note", target, label: display };
}

function inline(value: string, links: MarkdownDocument["links"]) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\[\[([^\]]+)\]\]/g, (_match, raw: string) => {
      const parsed = parseWikiTarget(raw);
      links.push(parsed);
      const href = parsed.type === "url" ? parsed.target : `#${parsed.type}:${encodeURIComponent(parsed.target)}`;
      return `<a href="${escapeHtml(href)}" data-link-type="${parsed.type}">${escapeHtml(parsed.label)}</a>`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      if (!SAFE_HREF.test(href) || href.toLowerCase().startsWith("javascript:")) {
        return escapeHtml(label);
      }
      links.push({ type: href.startsWith("/") || INTERNAL_LINK.test(href) ? "note" : "url", target: href, label });
      const rel = href.startsWith("http") ? ' rel="noopener noreferrer" target="_blank"' : "";
      return `<a href="${escapeHtml(href)}"${rel}>${escapeHtml(label)}</a>`;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function parseMarkdown(source: string): MarkdownDocument {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const toc: MarkdownDocument["toc"] = [];
  const links: MarkdownDocument["links"] = [];
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inCode = false;
  let code: string[] = [];

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      toc.push({ id, level, text });
      html.push(`<h${level} id="${id}">${inline(text, links)}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(unordered[1], links)}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ordered[1], links)}</li>`);
      continue;
    }

    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${inline(line.slice(2), links)}</blockquote>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    closeList();
    html.push(`<p>${inline(line, links)}</p>`);
  }

  closeList();
  if (inCode) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);

  return { html: html.join(""), toc, links };
}

export function extractWikiLinks(source: string) {
  return parseMarkdown(source).links.filter((link) => link.type !== "url");
}
