import type {
  MemoryProvider,
  Message,
  MemoryItem,
  SearchOptions,
  GetOptions,
  DeleteTarget,
  AnalyzeResult,
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

  async store(messages: Message[]): Promise<void> {
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

  async search(query: string, options?: SearchOptions): Promise<MemoryItem[]> {
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
      text: r.message.content,
      score: r.score,
      type: "message",
      metadata: { role: r.message.role, ...r.metadata },
    }));
  }

  async get(options?: GetOptions): Promise<MemoryItem[]> {
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
      text: m.content,
      type: "message",
      timestamp: new Date(m.created_at).getTime(),
      metadata: { role: m.role, ...m.metadata },
    }));
  }

  async delete(target: DeleteTarget): Promise<void> {
    if (target.memoryId) {
      await this.request("DELETE", `/threads/${this.threadId}/messages/${target.memoryId}`);
    } else if (target.sessionId) {
      await this.request("DELETE", `/threads/${target.sessionId}`);
    }
  }

  async analyze(query: string): Promise<AnalyzeResult> {
    if (!this.threadId) {
      return { text: "No thread context available." };
    }

    const memory = await this.request<{
      facts?: string[];
      summary?: { content: string };
    }>("GET", `/threads/${this.threadId}/memory`);

    const facts = memory.facts ?? [];
    const summary = memory.summary?.content ?? "";

    return {
      text: [summary, ...facts].filter(Boolean).join("\n"),
      metadata: { factCount: facts.length, hasSummary: !!summary },
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
