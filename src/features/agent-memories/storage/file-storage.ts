import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { MemoryStorage } from './storage.js';
import { Memory, SearchMemoryInput, MemorySearchResult } from '../models/memory.js';

/**
 * File-based storage implementation for agent memories
 * Stores each memory as an individual JSON file organized by category
 */
export class FileStorage implements MemoryStorage {
  private workingDirectory: string;
  private storageDir: string;
  private memoriesDir: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.storageDir = join(workingDirectory, '.cortex');
    this.memoriesDir = join(this.storageDir, 'memories');
  }

  /**
   * Initialize the file storage system
   */
  async initialize(): Promise<void> {
    try {
      // Validate that working directory exists
      await fs.access(this.workingDirectory);
    } catch (error) {
      throw new Error(`Working directory does not exist or is not accessible: ${this.workingDirectory}`);
    }

    try {
      // Ensure .cortex directory exists
      await fs.mkdir(this.storageDir, { recursive: true });

      // Ensure memories directory exists
      await fs.mkdir(this.memoriesDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to initialize file storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sanitize a string for safe filesystem usage
   */
  private sanitizeFileName(input: string): string {
    // Remove or replace unsafe characters
    let sanitized = input
      .replace(/[/\\:*?"<>|]/g, '_') // Replace unsafe chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

    // Limit length to 100 characters
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'memory';
    }

    return sanitized;
  }

  /**
   * Validate title length (max 50 characters for file naming)
   */
  private validateTitle(title: string): void {
    if (title.trim().length > 50) {
      throw new Error(`Memory title is too long for file naming (${title.trim().length} characters). Please keep titles to 50 characters or less for better organization. Current title: "${title.substring(0, 100)}..."`);
    }
  }

  /**
   * Get file path for a memory
   */
  private getMemoryFilePath(memory: Memory): string {
    const category = memory.category || 'general';
    const categoryDir = join(this.memoriesDir, this.sanitizeFileName(category));
    this.validateTitle(memory.title);
    const fileName = this.sanitizeFileName(memory.title) + '.json';
    return join(categoryDir, fileName);
  }

  /**
   * Get file path by ID (scan all categories)
   */
  private async findMemoryFileById(id: string): Promise<string | null> {
    try {
      const categories = await fs.readdir(this.memoriesDir, { withFileTypes: true });

      for (const category of categories) {
        if (category.isDirectory()) {
          const categoryPath = join(this.memoriesDir, category.name);
          const files = await fs.readdir(categoryPath);

          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = join(categoryPath, file);
              try {
                const content = await fs.readFile(filePath, 'utf-8');
                const memory = JSON.parse(content);
                if (memory.id === id) {
                  return filePath;
                }
              } catch (error) {
                // Skip invalid JSON files
                continue;
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Ensure category directory exists
   */
  private async ensureCategoryDirectory(category: string): Promise<void> {
    const categoryDir = join(this.memoriesDir, this.sanitizeFileName(category || 'general'));
    await fs.mkdir(categoryDir, { recursive: true });
  }

  /**
   * Handle file name conflicts by adding numeric suffix
   */
  private async resolveFileNameConflict(basePath: string): Promise<string> {
    let counter = 1;
    let filePath = basePath;

    while (true) {
      try {
        await fs.access(filePath);
        // File exists, try next number
        const dir = dirname(basePath);
        const ext = '.json';
        const baseNameWithExt = basePath.substring(dir.length + 1); // Get filename from path
        const baseName = baseNameWithExt.replace(ext, ''); // Remove extension
        filePath = join(dir, `${baseName}_${counter}${ext}`);
        counter++;
      } catch (error) {
        // File doesn't exist, we can use this path
        break;
      }
    }

    return filePath;
  }

  /**
   * Create a new memory
   */
  async createMemory(memory: Memory): Promise<Memory> {
    // Ensure category directory exists
    await this.ensureCategoryDirectory(memory.category || 'general');

    // Create simplified memory object for JSON storage
    const jsonMemory = {
      id: memory.id,
      title: memory.title,
      details: memory.content,
      category: memory.category || 'general',
      dateCreated: memory.createdAt,
      dateUpdated: memory.updatedAt
    };

    // Get file path and handle conflicts
    let filePath = this.getMemoryFilePath(memory);
    filePath = await this.resolveFileNameConflict(filePath);

    // Write to file
    await fs.writeFile(filePath, JSON.stringify(jsonMemory, null, 2), 'utf-8');

    return memory;
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(id: string): Promise<Memory | null> {
    const filePath = await this.findMemoryFileById(id);
    if (!filePath) {
      return null;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const jsonMemory = JSON.parse(content);

      // Convert back to Memory interface
      return {
        id: jsonMemory.id,
        title: jsonMemory.title,
        content: jsonMemory.details,
        metadata: {},
        createdAt: jsonMemory.dateCreated,
        updatedAt: jsonMemory.dateUpdated,
        category: jsonMemory.category === 'general' ? undefined : jsonMemory.category
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all memories with optional filtering
   */
  async getMemories(agentId?: string, category?: string, limit?: number): Promise<Memory[]> {
    const memories: Memory[] = [];

    try {
      const categories = await fs.readdir(this.memoriesDir, { withFileTypes: true });

      for (const categoryEntry of categories) {
        if (categoryEntry.isDirectory()) {
          // Skip if category filter doesn't match
          if (category && categoryEntry.name !== this.sanitizeFileName(category)) {
            continue;
          }

          const categoryPath = join(this.memoriesDir, categoryEntry.name);
          const files = await fs.readdir(categoryPath);

          for (const file of files) {
            if (file.endsWith('.json')) {
              const filePath = join(categoryPath, file);
              try {
                const content = await fs.readFile(filePath, 'utf-8');
                const jsonMemory = JSON.parse(content);

                // Convert to Memory interface
                const memory: Memory = {
                  id: jsonMemory.id,
                  title: jsonMemory.title,
                  content: jsonMemory.details,
                  metadata: {},
                  createdAt: jsonMemory.dateCreated,
                  updatedAt: jsonMemory.dateUpdated,
                  category: jsonMemory.category === 'general' ? undefined : jsonMemory.category
                };

                memories.push(memory);

                // Apply limit if specified
                if (limit && memories.length >= limit) {
                  return memories;
                }
              } catch (error) {
                // Skip invalid JSON files
                continue;
              }
            }
          }
        }
      }

      return memories;
    } catch (error) {
      return [];
    }
  }

  /**
   * Update an existing memory
   */
  async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | null> {
    const filePath = await this.findMemoryFileById(id);
    if (!filePath) {
      return null;
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const jsonMemory = JSON.parse(content);

      // Convert to Memory interface for merging
      const existingMemory: Memory = {
        id: jsonMemory.id,
        title: jsonMemory.title,
        content: jsonMemory.details,
        metadata: {},
        createdAt: jsonMemory.dateCreated,
        updatedAt: jsonMemory.dateUpdated,
        category: jsonMemory.category === 'general' ? undefined : jsonMemory.category
      };

      // Merge updates
      const updatedMemory: Memory = {
        ...existingMemory,
        ...updates,
        id: existingMemory.id, // Ensure ID doesn't change
        updatedAt: new Date().toISOString(),
      };

      // If category changed, we need to move the file
      if (updates.category !== undefined && updates.category !== existingMemory.category) {
        // Delete old file
        await fs.unlink(filePath);

        // Create new file in new category
        await this.createMemory(updatedMemory);
      } else {
        // Update existing file
        const updatedJsonMemory = {
          id: updatedMemory.id,
          title: updatedMemory.title,
          details: updatedMemory.content,
          category: updatedMemory.category || 'general',
          dateCreated: updatedMemory.createdAt,
          dateUpdated: updatedMemory.updatedAt
        };

        await fs.writeFile(filePath, JSON.stringify(updatedJsonMemory, null, 2), 'utf-8');
      }

      return updatedMemory;
    } catch (error) {
      return null;
    }
  }

  /**
   * Delete a memory
   */
  async deleteMemory(id: string): Promise<boolean> {
    const filePath = await this.findMemoryFileById(id);
    if (!filePath) {
      return false;
    }

    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Search memories by text content
   */
  async searchMemories(input: SearchMemoryInput): Promise<MemorySearchResult[]> {
    const query = typeof input.query === 'string' ? input.query.toLowerCase() : '';
    const limit = input.limit || 10;
    const results: MemorySearchResult[] = [];

    // Get all memories first
    const allMemories = await this.getMemories(undefined, input.category);

    for (const memory of allMemories) {
      // Simple text search in title, content, and category
      const titleMatch = memory.title.toLowerCase().includes(query);
      const contentMatch = memory.content.toLowerCase().includes(query);
      const categoryMatch = memory.category?.toLowerCase().includes(query) || false;

      if (titleMatch || contentMatch || categoryMatch) {
        // Calculate simple relevance score based on match position and frequency
        let score = 0;

        if (titleMatch) {
          const titleLower = memory.title.toLowerCase();
          const firstIndex = titleLower.indexOf(query);
          const occurrences = (titleLower.match(new RegExp(query, 'g')) || []).length;
          // Higher score for title matches (more important)
          score += (1 - firstIndex / titleLower.length) * 0.6 + (occurrences / 5) * 0.4;
        }

        if (contentMatch) {
          const contentLower = memory.content.toLowerCase();
          const firstIndex = contentLower.indexOf(query);
          const occurrences = (contentLower.match(new RegExp(query, 'g')) || []).length;
          // Lower score for content matches
          score += (1 - firstIndex / contentLower.length) * 0.3 + (occurrences / 10) * 0.3;
        }

        if (categoryMatch) {
          score += 0.2; // Bonus for category match
        }

        results.push({
          memory,
          score: Math.min(score, 1), // Cap at 1.0
          distance: 1 - score // Convert score to distance
        });
      }
    }

    // Sort by score (highest first) and apply limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Delete all memories for a specific agent (not applicable for simplified schema)
   */
  async deleteMemoriesByAgent(agentId: string): Promise<number> {
    // Since we removed agentId from the schema, this method returns 0
    return 0;
  }

  /**
   * Get memory statistics
   */
  async getStatistics(): Promise<{
    totalMemories: number;
    memoriesByAgent: Record<string, number>;
    memoriesByCategory: Record<string, number>;
    oldestMemory?: string;
    newestMemory?: string;
  }> {
    const memories = await this.getMemories();
    const memoriesByCategory: Record<string, number> = {};
    let oldestMemory: string | undefined;
    let newestMemory: string | undefined;

    for (const memory of memories) {
      // Count by category
      const category = memory.category || 'general';
      memoriesByCategory[category] = (memoriesByCategory[category] || 0) + 1;

      // Track oldest and newest
      if (!oldestMemory || memory.createdAt < oldestMemory) {
        oldestMemory = memory.createdAt;
      }
      if (!newestMemory || memory.createdAt > newestMemory) {
        newestMemory = memory.createdAt;
      }
    }

    return {
      totalMemories: memories.length,
      memoriesByAgent: {}, // Empty since we removed agentId
      memoriesByCategory,
      oldestMemory,
      newestMemory
    };
  }
}
