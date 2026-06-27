import type {
  MemoryProvider,
  Message,
  Memory,
  Entity,
  Fact,
  RecallOptions,
  ListOptions,
  EverOSConfig,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.evermind.ai";

export class EverOSProvider implements MemoryProvider {
  readonly name = "everos";
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly sessionId?: string;
  private readonly baseUrl: string;

  constructor(config: EverOSConfig) {
    this.apiKey = config.apiKey ?? env("EVEROS_API_KEY");
    this.userId = config.userId ?? env("EVEROS_USER_ID", "default_user");
    this.sessionId = config.sessionId;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async remember(messages: Message[]): Promise<void> {
    const now = Date.now();
    await this.post("/api/v1/memories", {
      user_id: this.userId,
      session_id: this.sessionId,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ?? now,
      })),
      async_mode: true,
    });
  }

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    const res = await this.post<{
      data: {
        episodes?: Array<{
          id: string;
          summary: string;
          episode: string;
          timestamp: string;
          score?: number | null;
        }>;
        profiles?: Array<{
          id: string;
          item_id: string;
          profile_data: { item_type: string; embed_text: string };
          score: number;
        }>;
      };
    }>("/api/v1/memories/search", {
      filters: { user_id: this.userId },
      query,
      method: options?.method ?? "hybrid",
      memory_types: options?.types ?? ["episodic_memory", "profile"],
      top_k: options?.topK ?? 5,
    });

    const items: Memory[] = [];

    if (res.data.episodes) {
      for (const ep of res.data.episodes) {
        items.push({
          id: ep.id,
          content: ep.summary || ep.episode,
          type: "episodic",
          score: ep.score ?? undefined,
          createdAt: parseTimestamp(ep.timestamp),
          metadata: { episode: ep.episode, summary: ep.summary },
        });
      }
    }

    if (res.data.profiles) {
      for (const p of res.data.profiles) {
        items.push({
          id: p.id,
          content: p.profile_data.embed_text,
          type: p.profile_data.item_type,
          score: p.score,
          metadata: { item_id: p.item_id },
        });
      }
    }

    return items;
  }

  async forget(target: { id?: string; userId?: string; sessionId?: string }): Promise<void> {
    await this.post("/api/v1/memories/delete", {
      memory_id: target.id,
      user_id: target.userId,
      session_id: target.sessionId,
    });
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    const memoryType = options?.type ?? "episodic_memory";
    const res = await this.post<{
      data: {
        episodes?: Array<{
          id: string;
          summary: string;
          episode: string;
          subject: string;
          timestamp: string;
        }>;
        profiles?: Array<{
          id: string;
          profile_data: {
            explicit_info: Array<{ category: string; description: string; item_id: string }>;
            implicit_traits: Array<{ trait: string; description: string; item_id: string }>;
          };
          scenario: string;
          memcell_count: number;
        }>;
        total_count: number;
      };
    }>("/api/v1/memories/get", {
      filters: { user_id: this.userId },
      memory_type: memoryType,
      page: options?.page ?? 1,
      page_size: options?.pageSize ?? 20,
    });

    if (memoryType === "profile" && res.data.profiles) {
      const items: Memory[] = [];
      for (const p of res.data.profiles) {
        const lines: string[] = [];
        for (const info of p.profile_data.explicit_info) {
          lines.push(`[${info.category}] ${info.description}`);
        }
        for (const trait of p.profile_data.implicit_traits) {
          lines.push(`[trait: ${trait.trait}] ${trait.description}`);
        }
        items.push({
          id: p.id,
          content: lines.join("\n"),
          type: "profile",
          metadata: { profile_data: p.profile_data, scenario: p.scenario },
        });
      }
      return items;
    }

    if (res.data.episodes) {
      return res.data.episodes.map((ep) => ({
        id: ep.id,
        content: ep.summary || ep.episode,
        type: "episodic",
        createdAt: parseTimestamp(ep.timestamp),
        metadata: { episode: ep.episode, subject: ep.subject },
      }));
    }

    return [];
  }

  async flush(): Promise<void> {
    await this.post("/api/v1/memories/flush", {
      user_id: this.userId,
      ...(this.sessionId ? { session_id: this.sessionId } : {}),
    });
  }

  async entities(_query?: string): Promise<Entity[]> {
    const profiles = await this.list({ type: "profile" });
    if (!profiles.length) return [];

    const p = profiles[0].metadata?.profile_data as {
      implicit_traits?: Array<{ trait: string; description: string; item_id: string }>;
    } | undefined;

    return (p?.implicit_traits ?? []).map((t) => ({
      id: t.item_id,
      name: t.trait,
      type: "trait",
      description: t.description,
    }));
  }

  async facts(_query?: string): Promise<Fact[]> {
    const profiles = await this.list({ type: "profile" });
    if (!profiles.length) return [];

    const p = profiles[0].metadata?.profile_data as {
      explicit_info?: Array<{ category: string; description: string; item_id: string }>;
    } | undefined;

    return (p?.explicit_info ?? []).map((info) => ({
      id: info.item_id,
      subject: this.userId,
      predicate: info.category,
      object: info.description,
    }));
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`EverOS API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
}

function env(key: string, fallback?: string): string {
  const val = process.env[key];
  if (!val && fallback === undefined) {
    throw new Error(`${key} environment variable is not set`);
  }
  return val ?? fallback!;
}

function parseTimestamp(ts: string | number | undefined): number | undefined {
  if (ts === undefined) return undefined;
  if (typeof ts === "number") return ts;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? undefined : ms;
}
