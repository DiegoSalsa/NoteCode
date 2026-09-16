import { estimateSerpCostUsd, seoSerpDepth } from "@/lib/seo/config";
import { fetchJsonWithRetry } from "@/lib/seo/http";
import { isDataForSeoPending, parseDataForSeoSerp, type DataForSeoLiveResponse } from "@/lib/seo/providers/dataforseo-parse";
import type { KeywordData, SerpMode, SerpProvider, SerpQuery, SerpResponse, SerpTaskHandle } from "@/lib/seo/providers/serp";

const LIVE_ADVANCED = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";
const TASK_POST = "https://api.dataforseo.com/v3/serp/google/organic/task_post";
const TASK_GET = "https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced";

const COUNTRY_LOCATION: Record<string, { code: number; name: string }> = {
  cl: { code: 2156, name: "Chile" },
  us: { code: 2840, name: "United States" },
  mx: { code: 2484, name: "Mexico" },
  ar: { code: 2032, name: "Argentina" },
  es: { code: 2724, name: "Spain" },
  co: { code: 2170, name: "Colombia" },
  pe: { code: 2604, name: "Peru" },
  br: { code: 2076, name: "Brazil" },
  uy: { code: 2858, name: "Uruguay" },
  py: { code: 2600, name: "Paraguay" },
  bo: { code: 2068, name: "Bolivia" },
  ec: { code: 2218, name: "Ecuador" },
  gb: { code: 2826, name: "United Kingdom" },
};

export function countryLocation(country: string) {
  return COUNTRY_LOCATION[country.trim().toLowerCase()] ?? null;
}

function basicAuth(login: string, password: string) {
  return `Basic ${Buffer.from(`${login}:${password}`, "utf8").toString("base64")}`;
}

function buildTask(query: SerpQuery) {
  const depth = query.depth ?? seoSerpDepth();
  const country = query.country.trim().toLowerCase();
  const mapped = countryLocation(country);
  const task: Record<string, unknown> = {
    keyword: query.keyword,
    language_code: query.language.trim().toLowerCase(),
    device: query.device,
    depth,
    tag: "notecode-rank-tracker",
  };
  if (query.location?.trim()) {
    task.location_name = mapped ? `${query.location.trim()},${mapped.name}` : query.location.trim();
  } else if (mapped) {
    task.location_code = mapped.code;
  } else {
    task.location_name = query.country.trim();
  }
  return task;
}

export class DataForSeoSerpProvider implements SerpProvider {
  readonly name = "dataforseo";
  private login: string;
  private password: string;

  constructor(credentials: { login: string; password: string }) {
    this.login = credentials.login;
    this.password = credentials.password;
  }

  private headers() {
    return {
      Authorization: basicAuth(this.login, this.password),
      "Content-Type": "application/json",
    };
  }

  async getOrganicResults(query: SerpQuery): Promise<SerpResponse> {
    const mode: SerpMode = query.mode === "standard" ? "standard" : "live";
    if (mode === "standard") {
      const [handle] = await this.submitOrganicTasks([query]);
      if (!handle) throw new Error("DataForSEO no aceptó la tarea standard.");
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const ready = await this.fetchOrganicTask(handle.taskId, query.device);
        if (ready) return { ...ready, costUsd: ready.costUsd || handle.costUsd };
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error(`SERP standard pendiente (${handle.taskId}). Se reintentará en el próximo job.`);
    }

    const depth = query.depth ?? seoSerpDepth();
    const { data } = await fetchJsonWithRetry<DataForSeoLiveResponse>(
      LIVE_ADVANCED,
      { method: "POST", headers: this.headers(), body: JSON.stringify([buildTask(query)]) },
      { timeoutMs: 120_000, retries: 1, retryOn: [429, 500, 502, 503, 504] },
    );
    const parsed = parseDataForSeoSerp(data, query.device, "live");
    if (!parsed.costUsd) parsed.costUsd = estimateSerpCostUsd("live", depth);
    return parsed;
  }

  async submitOrganicTasks(queries: SerpQuery[]): Promise<SerpTaskHandle[]> {
    if (!queries.length) return [];
    const handles: SerpTaskHandle[] = [];
    for (let index = 0; index < queries.length; index += 100) {
      const chunk = queries.slice(index, index + 100);
      const { data } = await fetchJsonWithRetry<DataForSeoLiveResponse>(
        TASK_POST,
        { method: "POST", headers: this.headers(), body: JSON.stringify(chunk.map(buildTask)) },
        { timeoutMs: 60_000, retries: 1, retryOn: [429, 500, 502, 503, 504] },
      );
      const tasks = data.tasks ?? [];
      for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
        const task = tasks[taskIndex];
        const keyword = chunk[taskIndex]?.keyword || "";
        if (!task?.id) continue;
        handles.push({
          taskId: task.id,
          keyword,
          costUsd: Number(task.cost ?? 0) || estimateSerpCostUsd("standard", chunk[taskIndex]?.depth),
        });
      }
    }
    return handles;
  }

  async fetchOrganicTask(taskId: string, device: SerpQuery["device"] = "desktop"): Promise<SerpResponse | null> {
    const { data } = await fetchJsonWithRetry<DataForSeoLiveResponse>(
      `${TASK_GET}/${encodeURIComponent(taskId)}`,
      { method: "GET", headers: this.headers() },
      { timeoutMs: 30_000, retries: 1, retryOn: [429, 500, 502, 503, 504] },
    );
    if (isDataForSeoPending(data)) return null;
    return parseDataForSeoSerp(data, device, "standard");
  }

  async getKeywordData(_query: SerpQuery): Promise<KeywordData | null> {
    return null;
  }
}
