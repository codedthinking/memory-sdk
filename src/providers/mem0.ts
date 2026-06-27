import type {
  MemoryProvider,
  Message,
  MemoryItem,
  SearchOptions,
  GetOptions,
  DeleteTarget,
  AnalyzeResult,
  Mem0Config,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.mem0.ai/v1";

export class Mem0Provider implements MemoryProvider {
  readonly name = "mem0";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly userId?: string;
  private readonly agentId?: string;
  private readonly orgId?: string;
  private readonly projectId?: string;

  constructor(config: Mem0Config) {
    this.apiKey = config.apiKey ?? env("MEM0_API_KEY");
    this.baseUrl = DEFAULT_BASE_URL;
    this.userId = config.userId;
    this.agentId = config.agentId;
    this.orgId = config.orgId;
    this.projectId = config.projectId;
  }

  async store(messages: Message[]): Promise<void> {
    await this.post("/memories/", {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...this.scopeParams(),
    });
  }

  async search(query: string, options?: SearchOptions): Promise<MemoryItem[]> {
    const result = await this.post<{
      results: Array<{
        id: string;
        memory: string;
        score?: number;
        categories?: string[];
        created_at?: string;
        metadata?: Record<string, unknown>;
      }>;
    }>("/memories/search/", {
      query,
      top_k: options?.topK ?? 5,
      ...this.scopeParams(),
    });

    return (result.results ?? []).map((r) => ({
      id: r.id,
      text: r.memory,
      score: r.score,
      type: r.categories?.[0] ?? "memory",
      timestamp: r.created_at ? new Date(r.created_at).getTime() : undefined,
      metadata: r.metadata,
    }));
  }

  async get(options?: GetOptions): Promise<MemoryItem[]> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const params = new URLSearchParams();
    if (this.userId) params.set("user_id", this.userId);
    if (this.agentId) params.set("agent_id", this.agentId);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));

    const result = await this.request<{
      results: Array<{
        id: string;
        memory: string;
        categories?: string[];
        created_at?: string;
        metadata?: Record<string, unknown>;
      }>;
    }>("GET", `/memories/?${params.toString()}`);

    return (result.results ?? []).map((r) => ({
      id: r.id,
      text: r.memory,
      type: r.categories?.[0] ?? "memory",
      timestamp: r.created_at ? new Date(r.created_at).getTime() : undefined,
      metadata: r.metadata,
    }));
  }

  async delete(target: DeleteTarget): Promise<void> {
    if (target.memoryId) {
      await this.request("DELETE", `/memories/${target.memoryId}/`);
    } else if (target.userId) {
      await this.request("DELETE", `/memories/?user_id=${target.userId}`);
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

  private scopeParams(): Record<string, string | undefined> {
    return {
      user_id: this.userId,
      agent_id: this.agentId,
      org_id: this.orgId,
      project_id: this.projectId,
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
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mem0 API ${res.status}: ${text}`);
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
