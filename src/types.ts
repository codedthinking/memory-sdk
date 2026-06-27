/** A chat message to store in memory. */
export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/** A memory item returned from search or get. */
export interface MemoryItem {
  id: string;
  text: string;
  score?: number;
  type?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/** Options for searching memories. */
export interface SearchOptions {
  topK?: number;
  types?: string[];
  method?: string;
}

/** Options for retrieving memories. */
export interface GetOptions {
  type?: string;
  page?: number;
  pageSize?: number;
}

/** Target for deleting memories. At least one field must be set. */
export interface DeleteTarget {
  memoryId?: string;
  userId?: string;
  sessionId?: string;
}

/** Result from analyze — higher-order reasoning over memories. */
export interface AnalyzeResult {
  text: string;
  sources?: MemoryItem[];
  metadata?: Record<string, unknown>;
}

/** Core interface that all memory providers implement. */
export interface MemoryProvider {
  readonly name: string;

  /** Ingest messages into memory. */
  store(messages: Message[]): Promise<void>;

  /** Find relevant memories by semantic query. */
  search(query: string, options?: SearchOptions): Promise<MemoryItem[]>;

  /** Retrieve memories by type or filter (not by query). */
  get(options?: GetOptions): Promise<MemoryItem[]>;

  /** Remove memories by ID, user, or session. */
  delete(target: DeleteTarget): Promise<void>;

  /** Higher-order reasoning: profiles, reflections, facts. */
  analyze(query: string): Promise<AnalyzeResult>;

  /** Force async memory extraction (providers that process asynchronously). */
  flush?(): Promise<void>;
}

// --- Provider configs (discriminated union) ---

export interface EverOSConfig {
  provider: "everos";
  apiKey?: string;
  userId?: string;
  sessionId?: string;
  baseUrl?: string;
}

export interface HindsightConfig {
  provider: "hindsight";
  apiKey?: string;
  baseUrl?: string;
  bankId?: string;
}

export interface NAMSConfig {
  provider: "nams";
  apiKey: string;
  baseUrl?: string;
}

export interface ZepConfig {
  provider: "zep";
  apiKey: string;
  userId?: string;
  sessionId?: string;
}

export interface Mem0Config {
  provider: "mem0";
  apiKey?: string;
  userId?: string;
  agentId?: string;
  orgId?: string;
  projectId?: string;
}

export interface SupermemoryConfig {
  provider: "supermemory";
  apiKey?: string;
  conversationId?: string;
}

export type MemoryProviderConfig =
  | EverOSConfig
  | HindsightConfig
  | NAMSConfig
  | ZepConfig
  | Mem0Config
  | SupermemoryConfig;
