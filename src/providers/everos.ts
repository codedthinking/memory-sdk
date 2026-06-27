import type {
  MemoryProvider,
  Message,
  MemoryItem,
  SearchOptions,
  GetOptions,
  DeleteTarget,
  AnalyzeResult,
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

  async store(messages: Message[]): Promise<void> {
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

  async search(query: string, options?: SearchOptions): Promise<MemoryItem[]> {
    const res = await this.post<{
      data: {
        episodes?: Array<{
          id: string;
          summary: string;
          episode: string;
          timestamp: number;
        }>;
        profiles?: Array<{
          profile_data: {
            explicit_info: Array<{ key: string; value: string }>;
            implicit_traits: Array<{ trait: string; confidence: number }>;
          };
        }>;
        total_count: number;
      };
    }>("/api/v1/memories/search", {
      filters: { user_id: this.userId },
      query,
      method: options?.method ?? "hybrid",
      memory_types: options?.types ?? ["episodic_memory", "profile"],
      top_k: options?.topK ?? 5,
    });

    const items: MemoryItem[] = [];

    if (res.data.episodes) {
      for (const ep of res.data.episodes) {
        items.push({
          id: ep.id,
          text: ep.summary || ep.episode,
          type: "episodic_memory",
          timestamp: ep.timestamp,
          metadata: { episode: ep.episode, summary: ep.summary },
        });
      }
    }

    if (res.data.profiles) {
      for (const [i, p] of res.data.profiles.entries()) {
        items.push({
          id: `profile-${i}`,
          text: p.profile_data.explicit_info
            .map((f) => `${f.key}: ${f.value}`)
            .join("\n"),
          type: "profile",
          metadata: { profile_data: p.profile_data },
        });
      }
    }

    return items;
  }

  async get(options?: GetOptions): Promise<MemoryItem[]> {
    const memoryType = options?.type ?? "episodic_memory";
    const res = await this.post<{
      data: {
        episodes?: Array<{
          id: string;
          summary: string;
          episode: string;
          subject: string;
          timestamp: number;
        }>;
        profiles?: Array<{
          profile_data: {
            explicit_info: Array<{ key: string; value: string }>;
            implicit_traits: Array<{ trait: string; confidence: number }>;
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
      return res.data.profiles.map((p, i) => ({
        id: `profile-${i}`,
        text: p.profile_data.explicit_info
          .map((f) => `${f.key}: ${f.value}`)
          .join("\n"),
        type: "profile",
        metadata: { profile_data: p.profile_data, scenario: p.scenario },
      }));
    }

    if (res.data.episodes) {
      return res.data.episodes.map((ep) => ({
        id: ep.id,
        text: ep.summary || ep.episode,
        type: "episodic_memory",
        timestamp: ep.timestamp,
        metadata: { episode: ep.episode, subject: ep.subject },
      }));
    }

    return [];
  }

  async delete(target: DeleteTarget): Promise<void> {
    await this.post("/api/v1/memories/delete", {
      memory_id: target.memoryId,
      user_id: target.userId,
      session_id: target.sessionId,
    });
  }

  async analyze(query: string): Promise<AnalyzeResult> {
    const profiles = await this.get({ type: "profile" });
    const episodes = await this.search(query, {
      types: ["episodic_memory"],
      topK: 5,
    });

    const profileText = profiles.map((p) => p.text).join("\n\n");
    const episodeText = episodes.map((e) => e.text).join("\n\n");

    return {
      text: [profileText, episodeText].filter(Boolean).join("\n\n---\n\n"),
      sources: [...profiles, ...episodes],
      metadata: { profileCount: profiles.length, episodeCount: episodes.length },
    };
  }

  async flush(): Promise<void> {
    await this.post("/api/v1/memories/flush", {
      user_id: this.userId,
      ...(this.sessionId ? { session_id: this.sessionId } : {}),
    });
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
