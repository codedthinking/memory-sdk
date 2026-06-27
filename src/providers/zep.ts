import type {
  MemoryProvider,
  Message,
  Memory,
  Fact,
  Reflection,
  RecallOptions,
  ListOptions,
  ZepConfig,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.getzep.com/api/v2";

export class ZepProvider implements MemoryProvider {
  readonly name = "zep";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly userId?: string;
  private threadId?: string;

  constructor(config: ZepConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = DEFAULT_BASE_URL;
    this.userId = config.userId;
    if (config.sessionId) {
      this.threadId = config.sessionId;
    }
  }

  async remember(messages: Message[]): Promise<void> {
    if (!this.threadId) {
      const thread = await this.post<{ uuid: string }>("/threads", {
        metadata: { user_id: this.userId },
      });
      this.threadId = thread.uuid;
    }

    await this.post(`/threads/${this.threadId}/messages`, {
      messages: messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        role_type: m.role,
        content: m.content,
        metadata: m.metadata,
      })),
    });
  }

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    const result = await this.post<{
      results: Array<{
        message: { uuid: string; content: string; role: string };
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    }>("/memory/search", {
      text: query,
      search_scope: "messages",
      search_type: "similarity",
      limit: options?.topK ?? 5,
      ...(this.userId ? { user_id: this.userId } : {}),
    });

    return (result.results ?? []).map((r) => ({
      id: r.message.uuid,
      content: r.message.content,
      score: r.score,
      type: "message",
      metadata: { role: r.message.role, ...r.metadata },
    }));
  }

  async forget(target: { id?: string; sessionId?: string }): Promise<void> {
    if (target.id && this.threadId) {
      await this.request("DELETE", `/threads/${this.threadId}/messages/${target.id}`);
    } else if (target.sessionId) {
      await this.request("DELETE", `/threads/${target.sessionId}`);
    }
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    if (!this.threadId) return [];

    const limit = options?.pageSize ?? 20;
    const result = await this.request<{
      messages: Array<{
        uuid: string;
        content: string;
        role: string;
        created_at: string;
        metadata?: Record<string, unknown>;
      }>;
    }>("GET", `/threads/${this.threadId}/messages?limit=${limit}`);

    return (result.messages ?? []).map((m) => ({
      id: m.uuid,
      content: m.content,
      type: "message",
      createdAt: new Date(m.created_at).getTime(),
      metadata: { role: m.role, ...m.metadata },
    }));
  }

  async facts(_query?: string): Promise<Fact[]> {
    if (!this.threadId) return [];

    const memory = await this.request<{
      facts?: string[];
    }>("GET", `/threads/${this.threadId}/memory`);

    return (memory.facts ?? []).map((fact, i) => ({
      id: `fact-${i}`,
      subject: this.userId ?? "user",
      predicate: "knows",
      object: fact,
    }));
  }

  async reflect(query: string): Promise<Reflection> {
    if (!this.threadId) {
      return { content: "No thread context available." };
    }

    const memory = await this.request<{
      facts?: string[];
      summary?: { content: string };
    }>("GET", `/threads/${this.threadId}/memory`);

    const facts = memory.facts ?? [];
    const summary = memory.summary?.content ?? "";
    const relevant = facts.filter((f) =>
      query.toLowerCase().split(/\s+/).some((w) => f.toLowerCase().includes(w)),
    );

    return {
      content: [summary, ...relevant].filter(Boolean).join("\n\n"),
      metadata: { totalFacts: facts.length, relevantFacts: relevant.length },
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
        Authorization: `Api-Key ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Zep API ${res.status}: ${text}`);
    }
    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }
}
