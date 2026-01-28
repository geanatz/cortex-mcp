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

      const frontmatter: Record<string, any> = {};
      const metadata: Record<string, any> = {};
      let inMetadata = false;

      for (const line of frontmatterStr.split('\n')) {
        if (line.startsWith('metadata:')) {
          inMetadata = true;
          continue;
        }

        if (inMetadata) {
          if (line.startsWith('  ')) {
            const match = line.match(/^\s{2}([\w-]+):\s*(.*)$/);
            if (match) {
              const [, key, value] = match;
              metadata[key] = this.parseYamlValue(value);
            }
            continue;
          }

          if (line.trim() && !line.startsWith(' ')) {
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

      if (Object.keys(metadata).length > 0) {
        frontmatter['metadata'] = metadata;
      }

      return { frontmatter, body };
    } catch {
      return null;
    }
  }

  /**
   * Parse a YAML value to its proper type
   */
  private parseYamlValue(value: string): any {
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null' || trimmed === '~') return null;
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
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

    if (memory.metadata && Object.keys(memory.metadata).length > 0) {
      lines.push('metadata:');
      for (const [key, value] of Object.entries(memory.metadata)) {
        lines.push(`  ${key}: ${this.serializeYamlValue(value)}`);
      }
    }

    lines.push('---');
    lines.push('');
    lines.push(memory.content);

    return lines.join('\n');
  }

  private serializeYamlValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'null';
    if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
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
        if (!file.endsWith('.md')) {
          continue;
        }
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
        } catch {
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Handle file name conflicts by adding numeric suffix
   */
  private async resolveFileNameConflict(basePath: string): Promise<string> {
    let counter = 1;
    let filePath = basePath;
    const ext = '.md';
    const baseNameWithExt = basename(basePath);
    const baseName = baseNameWithExt.replace(ext, '');

    while (await this.fileExists(filePath)) {
      filePath = join(this.memoriesDir, `${baseName}-${counter}${ext}`);
      counter++;
    }

    return filePath;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
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
  async getMemories(category?: string, limit?: number): Promise<Memory[]> {
    const memories: Memory[] = [];

    try {
      const files = await fs.readdir(this.memoriesDir);

      for (const file of files) {
        if (!file.endsWith('.md')) {
          continue;
        }
        const filePath = join(this.memoriesDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = this.parseMarkdownFile(content);

          if (!parsed) {
            continue;
          }

          const memory = this.fileToMemory(parsed.frontmatter, parsed.body);

          if (category && memory.category !== category) {
            continue;
          }

          memories.push(memory);

          if (limit && memories.length >= limit) {
            return memories;
          }
        } catch {
          continue;
        }
      }

      memories.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return memories;
    } catch {
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
    } catch {
      return false;
    }
  }

  /**
   * Search memories by text content
   */
  async searchMemories(input: SearchMemoryInput): Promise<MemorySearchResult[]> {
    const normalizedQuery = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
    if (!normalizedQuery) {
      return [];
    }

    const limit = input.limit || 10;
    const threshold = input.threshold ?? 0.3;
    const results: MemorySearchResult[] = [];

    const queryRegex = new RegExp(this.escapeRegex(normalizedQuery), 'g');
    const allMemories = await this.getMemories(input.category);

    for (const memory of allMemories) {
      const titleLower = memory.title.toLowerCase();
      const contentLower = memory.content.toLowerCase();
      const categoryLower = memory.category?.toLowerCase() || '';

      const titleMatch = titleLower.includes(normalizedQuery);
      const contentMatch = contentLower.includes(normalizedQuery);
      const categoryMatch = categoryLower.includes(normalizedQuery);

      if (!(titleMatch || contentMatch || categoryMatch)) {
        continue;
      }

      let score = 0;

      if (titleMatch) {
        const firstIndex = titleLower.indexOf(normalizedQuery);
        const occurrences = (titleLower.match(queryRegex) || []).length;
        score += (1 - firstIndex / Math.max(titleLower.length, 1)) * 0.6 + (occurrences / 5) * 0.4;
      }

      if (contentMatch) {
        const firstIndex = contentLower.indexOf(normalizedQuery);
        const occurrences = (contentLower.match(queryRegex) || []).length;
        score += (1 - firstIndex / Math.max(contentLower.length, 1)) * 0.3 + (occurrences / 10) * 0.3;
      }

      if (categoryMatch) {
        score += 0.2;
      }

      const normalizedScore = Math.min(score, 1);

      if (normalizedScore >= threshold) {
        results.push({
          memory,
          score: normalizedScore,
          distance: 1 - normalizedScore
        });
      }
    }

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
   * Get memory statistics
   */
  async getStatistics(): Promise<{
    totalMemories: number;
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
      memoriesByCategory,
      oldestMemory,
      newestMemory
    };
  }
}
