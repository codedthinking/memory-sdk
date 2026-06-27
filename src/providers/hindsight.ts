import type {
  MemoryProvider,
  Message,
  Memory,
  RecallOptions,
  HindsightConfig,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.hindsight.vectorize.io";

export class HindsightProvider implements MemoryProvider {
  readonly name = "hindsight";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly bankId: string;

  constructor(config: HindsightConfig) {
    this.apiKey = config.apiKey ?? process.env.HINDSIGHT_API_KEY ?? null;
    this.baseUrl =
      config.baseUrl ?? process.env.HINDSIGHT_BASE_URL ?? DEFAULT_BASE_URL;
    this.bankId =
      config.bankId ?? process.env.HINDSIGHT_BANK_ID ?? "default";
  }

  async remember(messages: Message[]): Promise<void> {
    for (const m of messages) {
      await this.post(`/v1/banks/${this.bankId}/retain`, {
        content: `[${m.role}] ${m.content}`,
        metadata: m.metadata,
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
      });
    }
  }

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    const result = await this.post<{
      memories: Array<{
        id: string;
        content: string;
        score?: number;
        metadata?: Record<string, unknown>;
        created_at?: string;
      }>;
    }>(`/v1/banks/${this.bankId}/recall`, {
      query,
      budget: options?.method ?? "mid",
      limit: options?.topK ?? 5,
    });

    return (result.memories ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      score: m.score,
      type: "memory",
      createdAt: m.created_at ? new Date(m.created_at).getTime() : undefined,
      metadata: m.metadata,
    }));
  }

  async forget(_target: { id?: string }): Promise<void> {
    throw new Error(
      "Hindsight REST API does not expose a delete endpoint. Manage retention via the dashboard.",
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hindsight API ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }
}
