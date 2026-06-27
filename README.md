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

// Store messages
await memory.store([
  { role: "user", content: "I prefer dark mode" },
  { role: "assistant", content: "Noted, I'll remember that." },
]);

// Search memories
const results = await memory.search("user preferences");

// Analyze / reflect
const analysis = await memory.analyze("what do I know about this user?");
```

## Providers

| Provider | Key | Docs |
|----------|-----|------|
| **EverOS** | `everos` | [evermind.ai](https://everos.evermind.ai) |
| **Hindsight** | `hindsight` | [vectorize.io](https://hindsight.vectorize.io) |
| **NAMS** | `nams` | [Neo4j Labs](https://memory.neo4jlabs.com) |
| **Zep** | `zep` | [getzep.com](https://help.getzep.com) |
| **Mem0** | `mem0` | [mem0.ai](https://docs.mem0.ai) |
| **Supermemory** | `supermemory` | [supermemory.ai](https://console.supermemory.ai) |

## Interface

Every provider implements `MemoryProvider`:

```typescript
interface MemoryProvider {
  readonly name: string;
  store(messages: Message[]): Promise<void>;
  search(query: string, options?: SearchOptions): Promise<MemoryItem[]>;
  get(options?: GetOptions): Promise<MemoryItem[]>;
  delete(target: DeleteTarget): Promise<void>;
  analyze(query: string): Promise<AnalyzeResult>;
  flush?(): Promise<void>;
}
```

## License

MIT
