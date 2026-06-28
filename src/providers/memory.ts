import type {
  MemoryProvider,
  Message,
  Memory,
  Entity,
  Fact,
  Reflection,
  RecallOptions,
  ListOptions,
  InMemoryConfig,
} from "../types.js";

let counter = 0;
function nextId(): string {
  return `mem_${++counter}_${Date.now()}`;
}

/**
 * In-memory mock provider — no API key needed.
 * Useful for demos, tests, and as a fallback when no cloud provider is configured.
 * Stores everything in plain arrays; recall does naive keyword matching.
 */
export class InMemoryProvider implements MemoryProvider {
  readonly name = "memory";

  private memories: Memory[] = [];
  private extractedEntities: Entity[] = [];
  private extractedFacts: Fact[] = [];

  constructor(_config?: InMemoryConfig) {
    // no config needed
  }

  async remember(messages: Message[]): Promise<void> {
    const now = Date.now();
    for (const msg of messages) {
      this.memories.push({
        id: nextId(),
        content: msg.content,
        type: msg.role,
        createdAt: msg.timestamp ?? now,
        metadata: { role: msg.role, ...msg.metadata },
      });
    }
    // naive entity/fact extraction from messages
    for (const msg of messages) {
      this.extractEntities(msg.content);
    }
  }

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    const topK = options?.topK ?? 5;
    const types = options?.types;

    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    const scored = this.memories
      .filter((m) => !types || (m.type && types.includes(m.type)))
      .map((m) => {
        const text = m.content.toLowerCase();
        const score = words.reduce(
          (acc, w) => acc + (text.includes(w) ? 1 : 0),
          0,
        );
        return { memory: m, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map((s) => ({ ...s.memory, score: s.score / words.length }));
  }

  async forget(target: {
    id?: string;
    userId?: string;
    sessionId?: string;
  }): Promise<void> {
    if (target.id) {
      this.memories = this.memories.filter((m) => m.id !== target.id);
      this.extractedEntities = this.extractedEntities.filter(
        (e) => e.id !== target.id,
      );
      this.extractedFacts = this.extractedFacts.filter(
        (f) => f.id !== target.id,
      );
    } else {
      // clear everything (userId/sessionId scoping not meaningful for in-memory)
      this.memories = [];
      this.extractedEntities = [];
      this.extractedFacts = [];
    }
  }

  async list(options?: ListOptions): Promise<Memory[]> {
    let items = this.memories;
    if (options?.type) {
      items = items.filter((m) => m.type === options.type);
    }
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }

  async flush(): Promise<void> {
    // no-op — everything is already synchronous in memory
  }

  async entities(query?: string): Promise<Entity[]> {
    if (!query) return this.extractedEntities;
    const q = query.toLowerCase();
    return this.extractedEntities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q),
    );
  }

  async facts(query?: string): Promise<Fact[]> {
    if (!query) return this.extractedFacts;
    const q = query.toLowerCase();
    return this.extractedFacts.filter(
      (f) =>
        f.subject.toLowerCase().includes(q) ||
        f.predicate.toLowerCase().includes(q) ||
        f.object.toLowerCase().includes(q),
    );
  }

  async reflect(query: string): Promise<Reflection> {
    const episodes = await this.recall(query, { topK: 5 });
    const relatedFacts = await this.facts(query);

    const lines = [
      ...relatedFacts.map((f) => `${f.subject} ${f.predicate} ${f.object}`),
      ...episodes.map((e) => e.content),
    ];

    return {
      content: lines.join("\n\n") || "No relevant memories found.",
      sources: episodes,
      metadata: { factCount: relatedFacts.length, episodeCount: episodes.length },
    };
  }

  async consolidate(): Promise<void> {
    // Deduplicate memories with identical content
    const seen = new Set<string>();
    this.memories = this.memories.filter((m) => {
      if (seen.has(m.content)) return false;
      seen.add(m.content);
      return true;
    });
  }

  /** Naive entity extraction: picks out capitalized multi-word phrases. */
  private extractEntities(text: string): void {
    const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g);
    if (!matches) return;
    for (const name of new Set(matches)) {
      if (!this.extractedEntities.some((e) => e.name === name)) {
        this.extractedEntities.push({
          id: nextId(),
          name,
          type: "noun_phrase",
          description: `Extracted from: "${text.slice(0, 80)}…"`,
        });
      }
    }
  }
}
