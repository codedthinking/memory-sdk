import type {
  MemoryProvider,
  Message,
  Memory,
  Entity,
  Fact,
  Reflection,
  RecallOptions,
  ListOptions,
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

  private bankPath(path: string): string {
    return `/v1/default/banks/${this.bankId}${path}`;
  }

  async remember(messages: Message[]): Promise<void> {
    const items = messages.map((m) => ({
      content: `[${m.role}] ${m.content}`,
      context: m.role,
      timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
    }));

    await this.post(this.bankPath("/memories"), {
      items,
      async: true,
    });
  }

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    const result = await this.post<{
      results: Array<{
        id: string;
        text: string;
        type?: string;
        context?: string;
        occurred_start?: string;
        occurred_end?: string;
        entities?: string[];
        chunk_id?: string;
      }>;
      entities?: Record<string, {
        canonical_name: string;
        entity_id: string;
        observations?: Array<{ text: string; mentioned_at?: string }>;
      }>;
    }>(this.bankPath("/memories/recall"), {
      query,
      budget: options?.method ?? "mid",
      max_tokens: 4096,
      include: { entities: { max_tokens: 500 } },
    });

    return result.results.map((r) => ({
      id: r.id,
      content: r.text,
      type: r.type ?? "memory",
      createdAt: r.occurred_start ? new Date(r.occurred_start).getTime() : undefined,
      metadata: {
        context: r.context,
        entities: r.entities,
        chunk_id: r.chunk_id,
      },
    }));
  }

  async forget(target: { id?: string }): Promise<void> {
    if (target.id) {
      await this.request("DELETE", this.bankPath(`/memories/${target.id}`));
    }
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    const limit = options?.pageSize ?? 20;
    const offset = ((options?.page ?? 1) - 1) * limit;

    const result = await this.request<{
      items: Array<{
        id: string;
        text: string;
        fact_type?: string;
        context?: string;
        date?: string;
        occurred_start?: string | null;
      }>;
    }>("GET", this.bankPath(`/memories/list?limit=${limit}&offset=${offset}`));

    return (result.items ?? []).map((m) => ({
      id: m.id,
      content: m.text,
      type: m.fact_type ?? "memory",
      createdAt: (m.occurred_start ?? m.date)
        ? new Date((m.occurred_start ?? m.date)!).getTime()
        : undefined,
      metadata: { context: m.context },
    }));
  }

  async entities(query?: string): Promise<Entity[]> {
    if (query) {
      // Recall with entity inclusion to get related entities
      const result = await this.post<{
        results: Array<unknown>;
        entities?: Record<string, {
          canonical_name: string;
          entity_id: string;
          observations?: Array<{ text: string }>;
        }>;
      }>(this.bankPath("/memories/recall"), {
        query,
        budget: "low",
        max_tokens: 1024,
        include: { entities: { max_tokens: 2000 } },
      });

      return Object.values(result.entities ?? {}).map((e) => ({
        id: e.entity_id,
        name: e.canonical_name,
        description: e.observations?.[0]?.text,
      }));
    }

    const result = await this.request<{
      items: Array<{
        id: string;
        canonical_name: string;
        mention_count?: number;
      }>;
    }>("GET", this.bankPath("/entities"));

    return result.items.map((e) => ({
      id: e.id,
      name: e.canonical_name,
      metadata: { mention_count: e.mention_count },
    }));
  }

  async facts(query?: string): Promise<Fact[]> {
    const result = await this.request<{
      nodes: Array<{ data: { id: string; label: string } }>;
      edges: Array<{ data: { source: string; target: string; linkType?: string; id?: string } }>;
    }>("GET", this.bankPath("/entities/graph"));

    const nodeMap = new Map(result.nodes.map((n) => [n.data.id, n.data.label]));

    let facts = result.edges.map((edge) => ({
      id: edge.data.id ?? `${edge.data.source}-${edge.data.target}`,
      subject: nodeMap.get(edge.data.source) ?? edge.data.source,
      predicate: edge.data.linkType ?? "related_to",
      object: nodeMap.get(edge.data.target) ?? edge.data.target,
      metadata: { sourceId: edge.data.source, targetId: edge.data.target },
    }));

    if (query) {
      const q = query.toLowerCase();
      facts = facts.filter(
        (f) =>
          f.subject.toLowerCase().includes(q) ||
          f.object.toLowerCase().includes(q) ||
          f.predicate.toLowerCase().includes(q),
      );
    }

    return facts;
  }

  async reflect(query: string): Promise<Reflection> {
    const result = await this.post<{
      text: string;
      usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
    }>(this.bankPath("/reflect"), {
      query,
      budget: "mid",
    });

    return {
      content: result.text ?? "",
      metadata: { usage: result.usage },
    };
  }

  async consolidate(): Promise<void> {
    // Hindsight consolidation endpoint
    await this.post(this.bankPath("/consolidate"), {});
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hindsight API ${res.status}: ${text}`);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }
}
