# Memory SDK

Thin provider-agnostic wrapper for AI memory backends. One interface, six providers.

## Install

```bash
npm install @codedthinking/memory-sdk
```

## Quick start

```typescript
import { createMemoryProvider } from "@codedthinking/memory-sdk";

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

// Get extracted facts (relations)
const userFacts = await memory.facts?.("user preferences");
// → [{ subject: "user-123", predicate: "prefers", object: "dark mode" }, ...]

// Get extracted entities (nodes)
const entities = await memory.entities?.();
// → [{ name: "Neovim", type: "tool", description: "..." }, ...]

// Forget
await memory.forget({ id: "mem-123" });
```

## Providers

| Provider | Key | remember | recall | forget | list | entities | facts |
|----------|-----|----------|--------|--------|------|----------|-------|
| [EverOS](https://everos.evermind.ai) | `everos` | yes | yes | yes | yes | yes | yes |
| [Hindsight](https://hindsight.vectorize.io) | `hindsight` | yes | yes | no | no | no | no |
| [NAMS](https://memory.neo4jlabs.com) | `nams` | yes | yes | yes | yes | yes | yes |
| [Zep](https://help.getzep.com) | `zep` | yes | yes | yes | yes | no | yes |
| [Mem0](https://docs.mem0.ai) | `mem0` | yes | yes | yes | yes | no | no |
| [Supermemory](https://console.supermemory.ai) | `supermemory` | yes | yes | yes | yes | no | no |

## Interface

```typescript
interface MemoryProvider {
  readonly name: string;

  // Core (every provider)
  remember(messages: Message[]): Promise<void>;
  recall(query: string, options?: RecallOptions): Promise<Memory[]>;
  forget(target: { id?: string; userId?: string; sessionId?: string }): Promise<void>;

  // Optional
  list?(options?: ListOptions): Promise<Memory[]>;
  flush?(): Promise<void>;
  entities?(query?: string): Promise<Entity[]>;
  facts?(query?: string): Promise<Fact[]>;
}
```

### Nouns

| Type | What it represents | Example |
|------|-------------------|---------|
| `Memory` | Episodic record (what happened) | "User discussed coffee preferences" |
| `Entity` | Extracted node (person, concept, tool) | `{ name: "Neovim", type: "tool" }` |
| `Fact` | Extracted relation (edge between entities) | `{ subject: "user", predicate: "prefers", object: "dark mode" }` |

### Verbs

| Method | What it does |
|--------|-------------|
| `remember` | Persist conversation messages |
| `recall` | Semantic search for relevant memories |
| `forget` | Remove memories |
| `list` | Retrieve memories by filter (non-query) |
| `flush` | Force async memory extraction |
| `entities` | Get extracted entity nodes |
| `facts` | Get extracted fact relations |

## License

MIT
