// --- Nouns ---

/** A chat message to ingest into memory. */
export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/** An episodic memory record — what happened. */
export interface Memory {
  id: string;
  content: string;
  type?: string;
  score?: number;
  createdAt?: number;
  metadata?: Record<string, unknown>;
}

/** An extracted entity — a node in the knowledge graph. */
export interface Entity {
  id: string;
  name: string;
  type?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/** An extracted fact — a relation (edge) between entities. */
export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

// --- Options ---

/** Options for recalling memories. */
export interface RecallOptions {
  topK?: number;
  types?: string[];
  method?: string;
}

/** Options for listing memories. */
export interface ListOptions {
  type?: string;
  page?: number;
  pageSize?: number;
}

// --- Verbs ---

/** Core interface that all memory providers implement. */
export interface MemoryProvider {
  readonly name: string;

  /** Persist conversation messages into memory. */
  remember(messages: Message[]): Promise<void>;

  /** Find relevant memories by semantic query. */
  recall(query: string, options?: RecallOptions): Promise<Memory[]>;

  /** Remove memories by ID, user, or session. */
  forget(target: { id?: string; userId?: string; sessionId?: string }): Promise<void>;

  /** Retrieve memories by type or filter (non-query). */
  list?(options?: ListOptions): Promise<Memory[]>;

  /** Force async memory extraction. */
  flush?(): Promise<void>;

  /** Get extracted entities (nodes). */
  entities?(query?: string): Promise<Entity[]>;

  /** Get extracted facts (relations/edges). */
  facts?(query?: string): Promise<Fact[]>;
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
