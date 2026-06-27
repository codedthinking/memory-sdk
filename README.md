# Memory SDK

Thin provider-agnostic wrapper for AI memory backends. One interface, six providers.

## Install

```bash
npm install codedthinking/memory-sdk
```

## Quick start

```typescript
import { createMemoryProvider } from "memory-sdk";

const memory = await createMemoryProvider({
  provider: "everos",
  apiKey: process.env.EVEROS_API_KEY,
  userId: "user-123",
});

// Remember conversation turns
await memory.remember([
  { role: "user", content: "I prefer dark mode and use Neovim." },
  { role: "assistant", content: "Noted!" },
]);

// Recall relevant memories
const memories = await memory.recall("editor preferences");

// Get extracted facts (relations between entities)
const userFacts = await memory.facts?.("user preferences");
// → [{ subject: "user-123", predicate: "prefers", object: "dark mode" }, ...]

// Get extracted entities (nodes in the knowledge graph)
const entities = await memory.entities?.();
// → [{ name: "Neovim", type: "SoftwareTool", description: "..." }, ...]

// Reflect — "how do we know this?"
const reflection = await memory.reflect?.("what does the user work on?");
// → { content: "The user is building a Memory SDK...", sources: [...] }

// Forget
await memory.forget({ id: "mem-123" });
```

## Providers

| Provider | Key | remember | recall | forget | list | entities | facts | reflect | consolidate |
|----------|-----|----------|--------|--------|------|----------|-------|---------|-------------|
| [EverOS](https://everos.evermind.ai) | `everos` | yes | yes | yes | yes | yes | yes | yes | yes |
| [Hindsight](https://hindsight.vectorize.io) | `hindsight` | yes | yes | yes | yes | yes | yes | yes | yes |
| [NAMS](https://memory.neo4jlabs.com) | `nams` | yes | yes | yes | yes | yes | yes | | |
| [Zep](https://help.getzep.com) | `zep` | yes | yes | yes | yes | | yes | yes | |
| [Mem0](https://docs.mem0.ai) | `mem0` | yes | yes | yes | yes | | | | |
| [Supermemory](https://console.supermemory.ai) | `supermemory` | yes | yes | yes | yes | | | | |

## Interface

```typescript
interface MemoryProvider {
  readonly name: string;

  // Core — every provider
  remember(messages: Message[]): Promise<void>;
  recall(query: string, options?: RecallOptions): Promise<Memory[]>;
  forget(target: { id?: string; userId?: string; sessionId?: string }): Promise<void>;

  // Optional
  list?(options?: ListOptions): Promise<Memory[]>;
  flush?(): Promise<void>;

  // Knowledge graph
  entities?(query?: string): Promise<Entity[]>;
  facts?(query?: string): Promise<Fact[]>;

  // Higher-order
  reflect?(query: string): Promise<Reflection>;
  consolidate?(): Promise<void>;
}
```

### Nouns

| Type | Graph analogy | What it represents | Example |
|------|--------------|-------------------|---------|
| `Memory` | Episode | What happened | "User discussed coffee preferences" |
| `Entity` | Node | Extracted thing | `{ name: "Neovim", type: "SoftwareTool" }` |
| `Fact` | Edge | Relation between entities | `{ subject: "user", predicate: "prefers", object: "dark mode" }` |
| `Reflection` | Traversal | Reasoned answer with provenance | `{ content: "Based on 3 episodes...", sources: [...] }` |

### Verbs

| Method | What it does |
|--------|-------------|
| `remember` | Persist conversation messages |
| `recall` | Semantic search for relevant memories |
| `forget` | Remove memories |
| `list` | Retrieve memories by filter (non-query) |
| `flush` | Force async memory extraction |
| `entities` | Get extracted entity nodes |
| `facts` | Get extracted fact relations (edges) |
| `reflect` | Reason over memories — "how do we know this?" |
| `consolidate` | Merge and reorganize fragmented memories (like sleep) |

## Provider config

```typescript
// EverOS
{ provider: "everos", apiKey?, userId?, sessionId?, baseUrl? }

// Hindsight
{ provider: "hindsight", apiKey?, bankId?, baseUrl? }

// NAMS
{ provider: "nams", apiKey, workspaceId, baseUrl? }

// Zep
{ provider: "zep", apiKey, userId?, sessionId? }

// Mem0
{ provider: "mem0", apiKey?, userId?, agentId?, orgId?, projectId? }

// Supermemory
{ provider: "supermemory", apiKey?, conversationId? }
```

## License

MIT
