/**
 * In-memory cache with TTL support
 * Provides efficient caching for storage operations
 */

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtl?: number;
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
  /** Enable statistics tracking (default: true) */
  trackStats?: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
  hitRate: number;
}

/**
 * Generic in-memory cache with TTL and LRU eviction
 */
export class Cache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly defaultTtl: number;
  private readonly maxSize: number;
  private readonly trackStats: boolean;
  
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.defaultTtl ?? 5 * 60 * 1000; // 5 minutes
    this.maxSize = options.maxSize ?? 1000;
    this.trackStats = options.trackStats ?? true;
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      if (this.trackStats) this.stats.misses++;
      return undefined;
    }
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      if (this.trackStats) this.stats.misses++;
      return undefined;
    }
    
    // Update access metadata
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    
    if (this.trackStats) this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }
    
    const now = Date.now();
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt: now + (ttl ?? this.defaultTtl),
      accessCount: 0,
      lastAccessedAt: now,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a prefix
   */
  deletePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Get or set with async factory
   */
  async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    
    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalidate entries matching a pattern
   */
  invalidate(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let count = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      if (this.trackStats) this.stats.evictions++;
    }
  }
}

/**
 * Create cache keys for different entity types
 */
export const CacheKeys = {
  task: (id: string) => `task:${id}`,
  taskList: (parentId?: string) => `tasks:${parentId ?? 'root'}`,
  allTasks: () => 'tasks:all',
  taskFolders: () => 'task-folders',
  artifact: (taskId: string, phase: string) => `artifact:${taskId}:${phase}`,
  allArtifacts: (taskId: string) => `artifacts:${taskId}`,
  hierarchy: (parentId?: string) => `hierarchy:${parentId ?? 'root'}`,
} as const;

/**
 * Cache invalidation patterns
 */
export const InvalidationPatterns = {
  task: (id: string) => new RegExp(`^(task:${id}|tasks:|hierarchy:)`),
  allTasks: () => /^(task:|tasks:|hierarchy:|task-folders)/,
  artifact: (taskId: string) => new RegExp(`^artifact(s)?:${taskId}`),
} as const;
