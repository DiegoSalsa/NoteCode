export type SearchHit = {
  type: "project" | "task" | "requirement" | "note" | "document" | "tech";
  id: string;
  projectId?: string | null;
  title: string;
  snippet: string;
  href: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function snippetAround(content: string, query: string, radius = 80) {
  const haystack = content.replace(/\s+/g, " ").trim();
  const index = normalize(haystack).indexOf(normalize(query));
  if (index < 0) return haystack.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(haystack.length, index + query.length + radius);
  return `${start > 0 ? "…" : ""}${haystack.slice(start, end)}${end < haystack.length ? "…" : ""}`;
}

export function levenshtein(a: string, b: string) {
  const left = normalize(a);
  const right = normalize(b);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[left.length][right.length];
}

export function fuzzyIncludes(haystack: string, query: string) {
  const h = normalize(haystack);
  const q = normalize(query);
  if (!q) return true;
  if (h.includes(q)) return true;
  const tokens = h.split(/\s+/);
  return tokens.some((token) => token.length >= 4 && levenshtein(token, q) <= Math.max(1, Math.floor(q.length / 5)));
}

export function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "ig"), (match) => `⟦${match}⟧`);
}
