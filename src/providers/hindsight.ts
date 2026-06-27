import type {
  MemoryProvider,
  Message,
  MemoryItem,
  SearchOptions,
  GetOptions,
  DeleteTarget,
  AnalyzeResult,
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
      config.baseUrl ??
      process.env.HINDSIGHT_BASE_URL ??
      DEFAULT_BASE_URL;
    this.bankId =
      config.bankId ?? process.env.HINDSIGHT_BANK_ID ?? "default";
  }

  async store(messages: Message[]): Promise<void> {
    for (const m of messages) {
      const content = `[${m.role}] ${m.content}`;
      await this.post(`/v1/banks/${this.bankId}/retain`, {
        content,
        metadata: m.metadata,
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
      });
    }
  }

  async search(query: string, options?: SearchOptions): Promise<MemoryItem[]> {
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
      text: m.content,
      score: m.score,
      type: "memory",
      timestamp: m.created_at ? new Date(m.created_at).getTime() : undefined,
      metadata: m.metadata,
    }));
  }

  async get(_options?: GetOptions): Promise<MemoryItem[]> {
    const result = await this.post<{
      text: string;
      metadata?: Record<string, unknown>;
    }>(`/v1/banks/${this.bankId}/reflect`, {
      query: "summarize everything you know",
      budget: "low",
    });

    if (!result.text) return [];

    return [
      {
        id: "mental-model",
        text: result.text,
        type: "mental_model",
        metadata: result.metadata,
      },
    ];
  }

  async delete(_target: DeleteTarget): Promise<void> {
    throw new Error(
      "Hindsight REST API does not expose a delete endpoint. Manage retention via the dashboard.",
    );
  }

  async analyze(query: string): Promise<AnalyzeResult> {
    const result = await this.post<{
      text: string;
      sources?: Array<{ id: string; content: string; score?: number }>;
    }>(`/v1/banks/${this.bankId}/reflect`, {
      query,
      budget: "mid",
    });

    return {
      text: result.text ?? "",
      sources: (result.sources ?? []).map((s) => ({
        id: s.id,
        text: s.content,
        score: s.score,
        type: "memory",
      })),
    };
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
