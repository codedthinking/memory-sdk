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
  private readonly workspaceId: string;
  private readonly baseUrl: string;
  private conversationId?: string;

  constructor(config: NAMSConfig) {
    this.apiKey = config.apiKey;
    this.workspaceId = config.workspaceId;
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
      searchType?: string;
    }>("/v1/entities/search", {
      query,
      limit: options?.topK ?? 10,
    });

    return result.entities.map((e) => ({
      id: e.id,
      content: e.description ?? e.name,
      score: e.score,
      type: e.type ?? "entity",
      metadata: { name: e.name, entityType: e.type },
    }));
  }

  async forget(target: { id?: string }): Promise<void> {
    if (target.id) {
      await this.request("DELETE", `/v1/entities/${target.id}`);
    }
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    if (options?.type === "conversation" && this.conversationId) {
      const result = await this.request<{
        messages: Array<{
          id: string;
          role: string;
          content: string;
          createdAt?: string;
          tokenCount?: number;
        }>;
      }>("GET", `/v1/conversations/${this.conversationId}/messages`);

      return result.messages.map((m) => ({
        id: m.id,
        content: m.content,
        type: "message",
        createdAt: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
        metadata: { role: m.role, tokenCount: m.tokenCount },
      }));
    }

    // Default: list entities as memories
    const result = await this.request<{
      entities: Array<{
        id: string;
        name: string;
        description?: string;
        type?: string;
        confidence?: number;
        createdAt?: string;
      }>;
    }>("GET", "/v1/entities");

    return result.entities.map((e) => ({
      id: e.id,
      content: e.description ?? e.name,
      type: e.type ?? "entity",
      createdAt: e.createdAt ? new Date(e.createdAt).getTime() : undefined,
      metadata: { name: e.name, confidence: e.confidence },
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
      }>("/v1/entities/search", { query });

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
        confidence?: number;
        sourceStage?: string;
      }>;
    }>("GET", "/v1/entities");

    return result.entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      description: e.description,
      metadata: { confidence: e.confidence, sourceStage: e.sourceStage },
    }));
  }

  async facts(query?: string): Promise<Fact[]> {
    const result = await this.request<{
      nodes: Array<{
        id: string;
        name: string;
        type?: string;
        description?: string;
      }>;
      edges: Array<{
        id: string;
        sourceId: string;
        targetId: string;
        type: string;
        predicate?: string;
        confidence?: number;
        method?: string;
      }>;
    }>("GET", "/v1/entities/graph");

    const nodeMap = new Map(result.nodes.map((n) => [n.id, n.name]));

    let facts = result.edges.map((edge) => ({
      id: edge.id,
      subject: nodeMap.get(edge.sourceId) ?? edge.sourceId,
      predicate: edge.predicate || edge.type,
      object: nodeMap.get(edge.targetId) ?? edge.targetId,
      confidence: edge.confidence,
      metadata: {
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        edgeType: edge.type,
        method: edge.method,
      },
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
        "X-Workspace-Id": this.workspaceId,
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
