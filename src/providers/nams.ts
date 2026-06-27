import type {
  MemoryProvider,
  Message,
  MemoryItem,
  SearchOptions,
  GetOptions,
  DeleteTarget,
  AnalyzeResult,
  NAMSConfig,
} from "../types.js";

const DEFAULT_BASE_URL = "https://memory.neo4jlabs.com";

export class NAMSProvider implements MemoryProvider {
  readonly name = "nams";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private conversationId?: string;

  constructor(config: NAMSConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async store(messages: Message[]): Promise<void> {
    if (!this.conversationId) {
      const conv = await this.post<{ id: string }>("/v1/conversations", {
        title: `session-${Date.now()}`,
      });
      this.conversationId = conv.id;
    }

    await this.post(`/v1/conversations/${this.conversationId}/messages/bulk`, {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
      })),
    });
  }

  async search(query: string, options?: SearchOptions): Promise<MemoryItem[]> {
    const entities = await this.post<{
      entities: Array<{
        id: string;
        name: string;
        description?: string;
        type?: string;
        score?: number;
      }>;
    }>("/v1/entities/search", {
      query,
      limit: options?.topK ?? 10,
    });

    return entities.entities.map((e) => ({
      id: e.id,
      text: e.description ?? e.name,
      score: e.score,
      type: e.type ?? "entity",
      metadata: { name: e.name },
    }));
  }

  async get(options?: GetOptions): Promise<MemoryItem[]> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    if (options?.type === "entity" || !options?.type) {
      const result = await this.request<{
        entities: Array<{
          id: string;
          name: string;
          description?: string;
          type?: string;
          created_at?: string;
        }>;
      }>("GET", `/v1/entities?limit=${pageSize}&offset=${offset}`);

      return result.entities.map((e) => ({
        id: e.id,
        text: e.description ?? e.name,
        type: e.type ?? "entity",
        timestamp: e.created_at ? new Date(e.created_at).getTime() : undefined,
        metadata: { name: e.name },
      }));
    }

    if (options.type === "conversation" && this.conversationId) {
      const result = await this.request<{
        messages: Array<{
          id: string;
          role: string;
          content: string;
          timestamp?: string;
        }>;
      }>("GET", `/v1/conversations/${this.conversationId}/messages?limit=${pageSize}&offset=${offset}`);

      return result.messages.map((m) => ({
        id: m.id,
        text: m.content,
        type: "message",
        timestamp: m.timestamp ? new Date(m.timestamp).getTime() : undefined,
        metadata: { role: m.role },
      }));
    }

    return [];
  }

  async delete(target: DeleteTarget): Promise<void> {
    if (target.memoryId) {
      await this.request("DELETE", `/v1/entities/${target.memoryId}`);
    }
  }

  async analyze(query: string): Promise<AnalyzeResult> {
    if (!this.conversationId) {
      return { text: "No conversation context available." };
    }

    const context = await this.request<{
      short_term: unknown;
      long_term: unknown;
      episodic: unknown;
    }>("GET", `/v1/conversations/${this.conversationId}/context`);

    const observations = await this.request<{
      observations: Array<{ id: string; content: string }>;
    }>("GET", `/v1/conversations/${this.conversationId}/observations`);

    return {
      text: observations.observations.map((o) => o.content).join("\n"),
      metadata: { context },
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
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NAMS API ${res.status}: ${text}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }
}
