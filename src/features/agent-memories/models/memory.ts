/**
 * Memory data model for the agent memories system
 */
export interface Memory {
  /** Unique identifier for the memory */
  id: string;
  /** Short title for file naming (max 50 characters) */
  title: string;
  /** Detailed memory content/text (no limit) */
  content: string;
  /** Flexible metadata object for additional information */
  metadata: Record<string, any>;
  /** Timestamp when the memory was created */
  createdAt: string;
  /** Timestamp when the memory was last updated */
  updatedAt: string;
  /** Optional categorization of the memory */
  category?: string;
}

/**
 * Input data for creating a new memory
 */
export interface CreateMemoryInput {
  /** Short title for file naming (max 50 characters) */
  title: string;
  /** Detailed memory content/text (no limit) */
  content: string;
  /** Flexible metadata object for additional information */
  metadata?: Record<string, any>;
  /** Optional categorization of the memory */
  category?: string;
}

/**
 * Input data for updating an existing memory
 */
export interface UpdateMemoryInput {
  /** Short title for file naming (max 50 characters, optional) */
  title?: string;
  /** Detailed memory content/text (no limit, optional) */
  content?: string;
  /** Flexible metadata object for additional information (optional) */
  metadata?: Record<string, any>;
  /** Optional categorization of the memory */
  category?: string;
}

/**
 * Input data for searching memories
 */
export interface SearchMemoryInput {
  /** Search query (text only) */
  query: string;
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum relevance threshold (0-1) */
  threshold?: number;
  /** Optional category filter */
  category?: string;
}

/**
 * Search result with similarity score
 */
export interface MemorySearchResult {
  /** The memory object */
  memory: Memory;
  /** Relevance score (0-1, higher is more relevant) */
  score: number;
  /** Distance metric from the query */
  distance: number;
}

/**
 * Configuration options for the memory system
 */
export interface MemoryConfig {
  /** Default similarity threshold for searches */
  defaultThreshold: number;
  /** Default maximum results for searches */
  defaultLimit: number;
}
