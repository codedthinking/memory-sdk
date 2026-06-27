import type {
  MemoryProvider,
  Message,
  MemoryItem,
  SearchOptions,
  GetOptions,
  DeleteTarget,
  AnalyzeResult,
  SupermemoryConfig,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.supermemory.ai/v3";

export class SupermemoryProvider implements MemoryProvider {
  readonly name = "supermemory";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly conversationId: string;

  constructor(config: SupermemoryConfig) {
    this.apiKey = config.apiKey ?? env("SUPERMEMORY_API_KEY");
    this.baseUrl = DEFAULT_BASE_URL;
    this.conversationId = config.conversationId ?? `session-${Date.now()}`;
  }

  async store(messages: Message[]): Promise<void> {
    for (const m of messages) {
      await this.post("/memories", {
        content: m.content,
        metadata: {
          role: m.role,
          ...m.metadata,
        },
      });
    }
  }

  async search(query: string, options?: SearchOptions): Promise<MemoryItem[]> {
    const result = await this.post<{
      results: Array<{
        id: string;
        content: string;
        score?: number;
        metadata?: Record<string, unknown>;
        created_at?: string;
      }>;
    }>("/memories/search", {
      query,
      limit: options?.topK ?? 5,
    });

    return (result.results ?? []).map((r) => ({
      id: r.id,
      text: r.content,
      score: r.score,
      type: "memory",
      timestamp: r.created_at ? new Date(r.created_at).getTime() : undefined,
      metadata: r.metadata,
    }));
  }

  async get(options?: GetOptions): Promise<MemoryItem[]> {
    const limit = options?.pageSize ?? 20;
    const result = await this.request<{
      results: Array<{
        id: string;
        content: string;
        metadata?: Record<string, unknown>;
        created_at?: string;
      }>;
    }>("GET", `/memories?limit=${limit}`);

    return (result.results ?? []).map((r) => ({
      id: r.id,
      text: r.content,
      type: "memory",
      timestamp: r.created_at ? new Date(r.created_at).getTime() : undefined,
      metadata: r.metadata,
    }));
  }

  async delete(target: DeleteTarget): Promise<void> {
    if (target.memoryId) {
      await this.request("DELETE", `/memories/${target.memoryId}`);
    }
  }

  async analyze(query: string): Promise<AnalyzeResult> {
    const memories = await this.search(query, { topK: 10 });
    return {
      text: memories.map((m) => m.text).join("\n"),
      sources: memories,
      metadata: { count: memories.length },
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supermemory API ${res.status}: ${text}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }
}

function env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} environment variable is not set`);
  return val;
}
