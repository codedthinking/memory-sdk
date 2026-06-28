import type { MemoryProvider, MemoryProviderConfig } from "./types.js";

/**
 * Create a memory provider from config.
 * Provider modules are loaded lazily so unused providers don't add to bundle size.
 */
export async function createMemoryProvider(
  config: MemoryProviderConfig,
): Promise<MemoryProvider> {
  switch (config.provider) {
    case "everos": {
      const { EverOSProvider } = await import("./providers/everos.js");
      return new EverOSProvider(config);
    }
    case "hindsight": {
      const { HindsightProvider } = await import("./providers/hindsight.js");
      return new HindsightProvider(config);
    }
    case "nams": {
      const { NAMSProvider } = await import("./providers/nams.js");
      return new NAMSProvider(config);
    }
    case "zep": {
      const { ZepProvider } = await import("./providers/zep.js");
      return new ZepProvider(config);
    }
    case "mem0": {
      const { Mem0Provider } = await import("./providers/mem0.js");
      return new Mem0Provider(config);
    }
    case "supermemory": {
      const { SupermemoryProvider } = await import("./providers/supermemory.js");
      return new SupermemoryProvider(config);
    }
    case "memory": {
      const { InMemoryProvider } = await import("./providers/memory.js");
      return new InMemoryProvider(config);
    }
    default:
      throw new Error(
        `Unknown provider: ${(config as { provider: string }).provider}`,
      );
  }
}
