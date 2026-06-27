import type {
  MemoryProvider,
  Message,
  Memory,
  Entity,
  Fact,
  RecallOptions,
  ListOptions,
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

  async remember(messages: Message[]): Promise<void> {
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

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    const result = await this.post<{
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

    return result.entities.map((e) => ({
      id: e.id,
      content: e.description ?? e.name,
      score: e.score,
      type: e.type ?? "entity",
      metadata: { name: e.name },
    }));
  }

  async forget(target: { id?: string }): Promise<void> {
    if (target.id) {
      await this.request("DELETE", `/v1/entities/${target.id}`);
    }
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    if (options?.type === "conversation" && this.conversationId) {
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
        content: m.content,
        type: "message",
        createdAt: m.timestamp ? new Date(m.timestamp).getTime() : undefined,
        metadata: { role: m.role },
      }));
    }

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
      content: e.description ?? e.name,
      type: e.type ?? "entity",
      createdAt: e.created_at ? new Date(e.created_at).getTime() : undefined,
      metadata: { name: e.name },
    }));
  }

  async entities(query?: string): Promise<Entity[]> {
    if (query) {
      const result = await this.post<{
        entities: Array<{
          id: string;
          name: string;
          description?: string;
          type?: string;
          score?: number;
        }>;
      }>("/v1/entities/search", { query, limit: 20 });

      return result.entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
        metadata: { score: e.score },
      }));
    }

    const result = await this.request<{
      entities: Array<{
        id: string;
        name: string;
        description?: string;
        type?: string;
      }>;
    }>("GET", "/v1/entities?limit=50");

    return result.entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
    }));
  }

  async facts(query?: string): Promise<Fact[]> {
    if (!query) {
      const result = await this.request<{
        graph: Array<{
          source: { id: string; name: string };
          relation: string;
          target: { id: string; name: string };
        }>;
      }>("GET", "/v1/entities/graph");

      return result.graph.map((edge, i) => ({
        id: `rel-${i}`,
        subject: edge.source.name,
        predicate: edge.relation,
        object: edge.target.name,
        metadata: { sourceId: edge.source.id, targetId: edge.target.id },
      }));
    }

    // Search entities then expand their graph
    const ents = await this.entities(query);
    if (!ents.length) return [];

    const allFacts: Fact[] = [];
    for (const ent of ents.slice(0, 5)) {
      const result = await this.post<{
        nodes: Array<{ id: string; name: string }>;
        edges: Array<{
          source: string;
          relation: string;
          target: string;
        }>;
      }>("/v1/graph/expand", { entity_id: ent.id });

      for (const [i, edge] of result.edges.entries()) {
        const sourceNode = result.nodes.find((n) => n.id === edge.source);
        const targetNode = result.nodes.find((n) => n.id === edge.target);
        allFacts.push({
          id: `${ent.id}-rel-${i}`,
          subject: sourceNode?.name ?? edge.source,
          predicate: edge.relation,
          object: targetNode?.name ?? edge.target,
          metadata: { sourceId: edge.source, targetId: edge.target },
        });
      }
    }

    return allFacts;
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
