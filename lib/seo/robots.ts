export type RobotsRules = {
  sitemaps: string[];
  disallows: string[];
  allows: string[];
};

export function parseRobots(text: string, userAgent = "notecodeseo") {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim()).filter(Boolean);
  const sitemaps: string[] = [];
  const groups: Array<{ agents: string[]; disallows: string[]; allows: string[] }> = [];
  let current: { agents: string[]; disallows: string[]; allows: string[] } | null = null;
  for (const line of lines) {
    const [keyRaw, ...rest] = line.split(":");
    const key = (keyRaw || "").trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || current.disallows.length || current.allows.length) {
        current = { agents: [], disallows: [], allows: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (key === "disallow") current.disallows.push(value);
    if (key === "allow") current.allows.push(value);
  }
  const ua = userAgent.toLowerCase();
  const matched = groups.find((group) => group.agents.some((agent) => agent === ua || ua.startsWith(agent)))
    || groups.find((group) => group.agents.includes("*"))
    || { disallows: [] as string[], allows: [] as string[] };
  return { sitemaps, disallows: matched.disallows, allows: matched.allows };
}

export function isDisallowed(pathname: string, rules: RobotsRules) {
  const path = pathname || "/";
  const matchLength = (pattern: string) => (path.startsWith(pattern) ? pattern.length : 0);
  const allow = Math.max(0, ...rules.allows.map(matchLength));
  const disallow = Math.max(0, ...rules.disallows.filter(Boolean).map(matchLength));
  return disallow > allow;
}
