/**
 * MCP Response builders
 * Provides consistent, type-safe response creation for MCP tools
 */

import { McpToolResponse, McpTextContent } from '../types/common.js';
import { 
  AppError, 
  isAppError, 
  getErrorMessage,
  ValidationError,
  NotFoundError,
  ConflictError,
  StorageError
} from '../errors/errors.js';

/**
 * Create a text content item
 */
function textContent(text: string): McpTextContent {
  return { type: 'text' as const, text };
}

/**
 * Create a success response with text content
 */
export function successResponse(text: string): McpToolResponse {
  return {
    content: [textContent(text)],
  };
}

/**
 * Create an error response with text content
 */
export function errorResponse(text: string): McpToolResponse {
  return {
    content: [textContent(`Error: ${text}`)],
    isError: true,
  };
}

/**
 * Create an error response from an Error object or unknown value
 */
export function createErrorResponse(error: unknown): McpToolResponse {
  const message = getErrorMessage(error);
  
  // Add context for specific error types
  if (isAppError(error)) {
    return errorResponse(message);
  }
  
  return errorResponse(message);
}

/**
 * Create a response from a Result type
 */
export function resultResponse<T>(
  result: { success: true; data: T } | { success: false; error: unknown },
  formatSuccess: (data: T) => string
): McpToolResponse {
  if (result.success) {
    return successResponse(formatSuccess(result.data));
  }
  return createErrorResponse(result.error);
}

/**
 * Response builder class for complex responses
 */
export class ResponseBuilder {
  private lines: string[] = [];
  private isError = false;

  /**
   * Add a heading
   */
  heading(text: string, level: 1 | 2 | 3 = 2): this {
    const prefix = '#'.repeat(level);
    this.lines.push(`${prefix} ${text}`);
    return this;
  }

  /**
   * Add a line of text
   */
  line(text: string): this {
    this.lines.push(text);
    return this;
  }

  /**
   * Add an empty line
   */
  blank(): this {
    this.lines.push('');
    return this;
  }

  /**
   * Add a horizontal rule
   */
  separator(): this {
    this.lines.push('---');
    return this;
  }

  /**
   * Add a bold line
   */
  bold(text: string): this {
    this.lines.push(`**${text}**`);
    return this;
  }

  /**
   * Add a key-value pair
   */
  field(key: string, value: string | number | boolean | undefined | null): this {
    const displayValue = value === undefined || value === null ? 'None' : String(value);
    this.lines.push(`• **${key}:** ${displayValue}`);
    return this;
  }

  /**
   * Add multiple key-value pairs
   */
  fields(data: Record<string, string | number | boolean | undefined | null>): this {
    for (const [key, value] of Object.entries(data)) {
      this.field(key, value);
    }
    return this;
  }

  /**
   * Add a bullet point
   */
  bullet(text: string): this {
    this.lines.push(`• ${text}`);
    return this;
  }

  /**
   * Add multiple bullet points
   */
  bullets(items: string[]): this {
    for (const item of items) {
      this.bullet(item);
    }
    return this;
  }

  /**
   * Add an icon with text
   */
  icon(emoji: string, text: string): this {
    this.lines.push(`${emoji} ${text}`);
    return this;
  }

  /**
   * Add a success message
   */
  success(text: string): this {
    return this.icon('✅', text);
  }

  /**
   * Add an error message
   */
  error(text: string): this {
    this.isError = true;
    return this.icon('❌', text);
  }

  /**
   * Add a warning message
   */
  warning(text: string): this {
    return this.icon('⚠️', text);
  }

  /**
   * Add an info message
   */
  info(text: string): this {
    return this.icon('ℹ️', text);
  }

  /**
   * Add a tip message
   */
  tip(text: string): this {
    return this.icon('💡', text);
  }

  /**
   * Add indented text
   */
  indent(text: string, level: number = 1): this {
    const spaces = '  '.repeat(level);
    this.lines.push(`${spaces}${text}`);
    return this;
  }

  /**
   * Add code block
   */
  code(content: string, language?: string): this {
    this.lines.push(`\`\`\`${language || ''}`);
    this.lines.push(content);
    this.lines.push('```');
    return this;
  }

  /**
   * Add inline code
   */
  inlineCode(text: string): this {
    this.lines.push(`\`${text}\``);
    return this;
  }

  /**
   * Conditional content
   */
  when(condition: boolean, builder: (b: ResponseBuilder) => void): this {
    if (condition) {
      builder(this);
    }
    return this;
  }

  /**
   * Add content from another builder
   */
  append(other: ResponseBuilder): this {
    this.lines.push(...other.lines);
    return this;
  }

  /**
   * Build the final response
   */
  build(): McpToolResponse {
    return {
      content: [textContent(this.lines.join('\n'))],
      isError: this.isError || undefined,
    };
  }

  /**
   * Get the raw text content
   */
  toString(): string {
    return this.lines.join('\n');
  }
}

/**
 * Create a new response builder
 */
export function response(): ResponseBuilder {
  return new ResponseBuilder();
}

/**
 * Common response patterns
 */
export const Responses = {
  /**
   * Task created successfully
   */
  taskCreated(task: { id: string; details: string; status: string; level?: number; parentId?: string }): McpToolResponse {
    const level = task.level || 0;
    const indent = '  '.repeat(level) + '→';
    
    return response()
      .success('Task created successfully!')
      .blank()
      .bold(`${indent} ${task.id}`)
      .line(task.parentId ? `Parent: ${task.parentId}` : 'Top-level task')
      .line(`Level: ${level} ${level === 0 ? '(Top-level)' : `(${level} level${level > 1 ? 's' : ''} deep)`}`)
      .blank()
      .heading('Task Details', 3)
      .field('Details', task.details)
      .field('Status', task.status)
      .build();
  },

  /**
   * Task not found error
   */
  taskNotFound(taskId: string): McpToolResponse {
    return errorResponse(`Task with ID "${taskId}" not found. Use cortex_list_tasks to see all available tasks.`);
  },

  /**
   * Validation error
   */
  validationError(field: string, message: string): McpToolResponse {
    return errorResponse(`${field}: ${message}`);
  },

  /**
   * Confirmation required
   */
  confirmationRequired(action: string): McpToolResponse {
    return errorResponse(`You must set confirm to true to ${action}.`);
  },

  /**
   * No results found
   */
  noResults(scope: string): McpToolResponse {
    return successResponse(`No tasks found ${scope}. Create your first task using cortex_create_task.`);
  },
} as const;
