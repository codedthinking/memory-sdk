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

const DEFAULT_BASE_URL = "https://api.hindsight.vectorize.io/mcp";

export class HindsightProvider implements MemoryProvider {
  readonly name = "hindsight";
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly bankId?: string;

  constructor(config: HindsightConfig) {
    this.apiKey = config.apiKey ?? process.env.HINDSIGHT_API_KEY ?? null;
    this.baseUrl =
      config.baseUrl ??
      process.env.HINDSIGHT_MCP_URL ??
      DEFAULT_BASE_URL;
    this.bankId =
      config.bankId ?? process.env.HINDSIGHT_MCP_BANK_ID;
  }

  async store(messages: Message[]): Promise<void> {
    const content = messages
      .map((m) => `[${m.role}] ${m.content}`)
      .join("\n");
    await this.callTool("retain", { content });
  }

  async search(query: string, _options?: SearchOptions): Promise<MemoryItem[]> {
    const result = await this.callTool<{
      memories?: Array<{ id: string; content: string; score?: number; metadata?: Record<string, unknown> }>;
    }>("recall", { query });

    return (result.memories ?? []).map((m) => ({
      id: m.id,
      text: m.content,
      score: m.score,
      type: "memory",
      metadata: m.metadata,
    }));
  }

  async get(_options?: GetOptions): Promise<MemoryItem[]> {
    const result = await this.callTool<{
      mentalModel?: { content: string; metadata?: Record<string, unknown> };
    }>("getMentalModel", {});

    if (!result.mentalModel) return [];

    return [
      {
        id: "mental-model",
        text: result.mentalModel.content,
        type: "mental_model",
        metadata: result.mentalModel.metadata,
      },
    ];
  }

  async delete(_target: DeleteTarget): Promise<void> {
    throw new Error("Hindsight provider does not support direct deletion via MCP tools");
  }

  async analyze(query: string): Promise<AnalyzeResult> {
    const result = await this.callTool<{
      reflection?: string;
      basedOn?: Array<{ id: string; content: string }>;
    }>("reflect", { query });

    return {
      text: result.reflection ?? "",
      sources: (result.basedOn ?? []).map((s) => ({
        id: s.id,
        text: s.content,
        type: "memory",
      })),
    };
  }

  private async callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    if (this.bankId) {
      headers["X-Bank-Id"] = this.bankId;
    }

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hindsight API ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      result?: { content?: Array<{ text?: string }> };
      error?: { message: string };
    };

    if (json.error) {
      throw new Error(`Hindsight tool error: ${json.error.message}`);
    }

    const text = json.result?.content?.[0]?.text;
    if (text) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return { text } as T;
      }
    }

    return {} as T;
  }
}
