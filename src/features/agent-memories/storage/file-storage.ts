import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { MemoryStorage } from './storage.js';
import { Memory, SearchMemoryInput, MemorySearchResult } from '../models/memory.js';

/**
 * File-based storage implementation for agent memories
 * Stores each memory as a markdown file with YAML frontmatter
 * 
 * Storage format:
 * .cortex/memories/
 *   user-prefers-concise-responses.md
 *   project-uses-typescript.md
 *   api-key-location.md
 * 
 * File format:
 * ---
 * id: uuid
 * title: User prefers concise responses
 * category: user_preferences
 * createdAt: 2024-01-01T00:00:00.000Z
 * updatedAt: 2024-01-01T00:00:00.000Z
 * metadata:
 *   key: value
 * ---
 * 
 * Content goes here...
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
   * Sanitize a string for safe filesystem usage (kebab-case)
   */
  private sanitizeFileName(input: string): string {
    // Convert to lowercase, replace spaces and unsafe characters with hyphens
    let sanitized = input
      .toLowerCase()
      .trim()
      .replace(/[/\\:*?"<>|]/g, '-') // Replace unsafe chars with hyphen
      .replace(/\s+/g, '-') // Replace spaces with hyphen
      .replace(/[^a-z0-9-]/g, '-') // Replace any remaining non-alphanumeric with hyphen
      .replace(/-{2,}/g, '-') // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

    // Limit length to 100 characters
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100).replace(/-+$/, ''); // Clean trailing hyphen after truncation
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
   * Get file path for a memory based on title
   */
  private getMemoryFilePath(title: string): string {
    this.validateTitle(title);
    const fileName = this.sanitizeFileName(title) + '.md';
    return join(this.memoriesDir, fileName);
  }

  /**
   * Parse YAML frontmatter from markdown content
   */
  private parseMarkdownFile(content: string): { frontmatter: Record<string, any>; body: string } | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      return null;
    }

    try {
      const frontmatterStr = frontmatterMatch[1];
      const body = frontmatterMatch[2].trim();

      // Simple YAML parsing (for our limited use case)
      const frontmatter: Record<string, any> = {};
      let currentKey: string | null = null;
      let inMetadata = false;
      const metadata: Record<string, any> = {};

      for (const line of frontmatterStr.split('\n')) {
        if (line.startsWith('metadata:')) {
          inMetadata = true;
          currentKey = 'metadata';
          continue;
        }

        if (inMetadata) {
          if (line.startsWith('  ')) {
            // Metadata key-value pair
            const match = line.match(/^\s{2}(\w+):\s*(.*)$/);
            if (match) {
              const [, key, value] = match;
              metadata[key] = this.parseYamlValue(value);
            }
          } else if (line.trim() && !line.startsWith(' ')) {
            // End of metadata block
            inMetadata = false;
            frontmatter['metadata'] = metadata;
          }
        }

        if (!inMetadata && line.trim()) {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            frontmatter[key] = this.parseYamlValue(value);
          }
        }
      }

      if (inMetadata) {
        frontmatter['metadata'] = metadata;
      }

      return { frontmatter, body };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse a YAML value to its proper type
   */
  private parseYamlValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null' || value === '~') return null;
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    return value;
  }

  /**
   * Serialize memory to markdown with YAML frontmatter
   */
  private serializeToMarkdown(memory: Memory): string {
    const lines: string[] = ['---'];

    lines.push(`id: ${memory.id}`);
    lines.push(`title: "${memory.title.replace(/"/g, '\\"')}"`);
    if (memory.category) {
      lines.push(`category: ${memory.category}`);
    }
    lines.push(`createdAt: ${memory.createdAt}`);
    lines.push(`updatedAt: ${memory.updatedAt}`);

    // Add metadata if present
    if (memory.metadata && Object.keys(memory.metadata).length > 0) {
      lines.push('metadata:');
      for (const [key, value] of Object.entries(memory.metadata)) {
        if (typeof value === 'string') {
          lines.push(`  ${key}: "${value.replace(/"/g, '\\"')}"`);
        } else {
          lines.push(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    lines.push('---');
    lines.push('');
    lines.push(memory.content);

    return lines.join('\n');
  }

  /**
   * Convert parsed file to Memory object
   */
  private fileToMemory(frontmatter: Record<string, any>, body: string): Memory {
    return {
      id: frontmatter.id || '',
      title: frontmatter.title || '',
      content: body,
      metadata: frontmatter.metadata || {},
      createdAt: frontmatter.createdAt || new Date().toISOString(),
      updatedAt: frontmatter.updatedAt || new Date().toISOString(),
      category: frontmatter.category || undefined
    };
  }

  /**
   * Find memory file by ID (scan all files)
   */
  private async findMemoryFileById(id: string): Promise<{ path: string; memory: Memory } | null> {
    try {
      const files = await fs.readdir(this.memoriesDir);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = join(this.memoriesDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parsed = this.parseMarkdownFile(content);
            if (parsed && parsed.frontmatter.id === id) {
              return {
                path: filePath,
                memory: this.fileToMemory(parsed.frontmatter, parsed.body)
              };
            }
          } catch (error) {
            // Skip invalid files
            continue;
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
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
        const ext = '.md';
        const baseNameWithExt = basename(basePath);
        const baseName = baseNameWithExt.replace(ext, '');
        filePath = join(this.memoriesDir, `${baseName}-${counter}${ext}`);
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
    // Get file path and handle conflicts
    let filePath = this.getMemoryFilePath(memory.title);
    filePath = await this.resolveFileNameConflict(filePath);

    // Serialize and write to file
    const markdownContent = this.serializeToMarkdown(memory);
    await fs.writeFile(filePath, markdownContent, 'utf-8');

    return memory;
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(id: string): Promise<Memory | null> {
    const result = await this.findMemoryFileById(id);
    return result ? result.memory : null;
  }

  /**
   * Get all memories with optional filtering
   */
  async getMemories(agentId?: string, category?: string, limit?: number): Promise<Memory[]> {
    const memories: Memory[] = [];

    try {
      const files = await fs.readdir(this.memoriesDir);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = join(this.memoriesDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parsed = this.parseMarkdownFile(content);

            if (parsed) {
              const memory = this.fileToMemory(parsed.frontmatter, parsed.body);

              // Apply category filter if specified
              if (category && memory.category !== category) {
                continue;
              }

              memories.push(memory);

              // Apply limit if specified
              if (limit && memories.length >= limit) {
                return memories;
              }
            }
          } catch (error) {
            // Skip invalid files
            continue;
          }
        }
      }

      // Sort by updatedAt descending (most recent first)
      memories.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return memories;
    } catch (error) {
      return [];
    }
  }

  /**
   * Update an existing memory
   */
  async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | null> {
    const result = await this.findMemoryFileById(id);
    if (!result) {
      return null;
    }

    const { path: oldFilePath, memory: existingMemory } = result;

    // Merge updates
    const updatedMemory: Memory = {
      ...existingMemory,
      ...updates,
      id: existingMemory.id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };

    // If title changed, we need to move the file
    if (updates.title !== undefined && updates.title !== existingMemory.title) {
      // Delete old file
      await fs.unlink(oldFilePath);

      // Create new file with new name
      let newFilePath = this.getMemoryFilePath(updatedMemory.title);
      newFilePath = await this.resolveFileNameConflict(newFilePath);

      const markdownContent = this.serializeToMarkdown(updatedMemory);
      await fs.writeFile(newFilePath, markdownContent, 'utf-8');
    } else {
      // Update existing file
      const markdownContent = this.serializeToMarkdown(updatedMemory);
      await fs.writeFile(oldFilePath, markdownContent, 'utf-8');
    }

    return updatedMemory;
  }

  /**
   * Delete a memory
   */
  async deleteMemory(id: string): Promise<boolean> {
    const result = await this.findMemoryFileById(id);
    if (!result) {
      return false;
    }

    try {
      await fs.unlink(result.path);
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
    const threshold = input.threshold || 0.3;
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
          const occurrences = (titleLower.match(new RegExp(this.escapeRegex(query), 'g')) || []).length;
          // Higher score for title matches (more important)
          score += (1 - firstIndex / titleLower.length) * 0.6 + (occurrences / 5) * 0.4;
        }

        if (contentMatch) {
          const contentLower = memory.content.toLowerCase();
          const firstIndex = contentLower.indexOf(query);
          const occurrences = (contentLower.match(new RegExp(this.escapeRegex(query), 'g')) || []).length;
          // Lower score for content matches
          score += (1 - firstIndex / contentLower.length) * 0.3 + (occurrences / 10) * 0.3;
        }

        if (categoryMatch) {
          score += 0.2; // Bonus for category match
        }

        const normalizedScore = Math.min(score, 1); // Cap at 1.0

        // Only include results above threshold
        if (normalizedScore >= threshold) {
          results.push({
            memory,
            score: normalizedScore,
            distance: 1 - normalizedScore // Convert score to distance
          });
        }
      }
    }

    // Sort by score (highest first) and apply limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      const category = memory.category || 'uncategorized';
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
