import type {
  MemoryProvider,
  Message,
  Memory,
  RecallOptions,
  ListOptions,
  SupermemoryConfig,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.supermemory.ai/v3";

export class SupermemoryProvider implements MemoryProvider {
  readonly name = "supermemory";
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: SupermemoryConfig) {
    this.apiKey = config.apiKey ?? env("SUPERMEMORY_API_KEY");
    this.baseUrl = DEFAULT_BASE_URL;
  }

  async remember(messages: Message[]): Promise<void> {
    for (const m of messages) {
      await this.post("/memories", {
        content: m.content,
        metadata: { role: m.role, ...m.metadata },
      });
    }
  }

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
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
      content: r.content,
      score: r.score,
      type: "memory",
      createdAt: r.created_at ? new Date(r.created_at).getTime() : undefined,
      metadata: r.metadata,
    }));
  }

  async forget(target: { id?: string }): Promise<void> {
    if (target.id) {
      await this.request("DELETE", `/memories/${target.id}`);
    }
  }

  async list(options?: ListOptions): Promise<Memory[]> {
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
      content: r.content,
      type: "memory",
      createdAt: r.created_at ? new Date(r.created_at).getTime() : undefined,
      metadata: r.metadata,
    }));
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
