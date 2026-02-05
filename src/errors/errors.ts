/**
 * Custom error classes for the application
 * Provides typed, hierarchical error handling
 */

/**
 * Base application error class
 * All custom errors should extend this
 */
export abstract class AppError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();
    this.context = context;
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
    };
  }
}

/**
 * Error codes enum for type-safe error handling
 */
export const ErrorCodes = {
  // Validation errors (4xx equivalent)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  ARTIFACT_NOT_FOUND: 'ARTIFACT_NOT_FOUND',
  PARENT_NOT_FOUND: 'PARENT_NOT_FOUND',
  DEPENDENCY_NOT_FOUND: 'DEPENDENCY_NOT_FOUND',
  
  // Conflict errors
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
  SELF_REFERENCE: 'SELF_REFERENCE',
  
  // Storage errors
  STORAGE_ERROR: 'STORAGE_ERROR',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  DIRECTORY_ERROR: 'DIRECTORY_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  
  // System errors
  INITIALIZATION_ERROR: 'INITIALIZATION_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Validation error for input validation failures
 */
export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(
    message: string,
    field?: string,
    value?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, ErrorCodes.VALIDATION_ERROR, { ...context, field, value });
    this.field = field;
    this.value = value;
  }

  static requiredField(field: string): ValidationError {
    return new ValidationError(
      `${field} is required.`,
      field,
      undefined,
      { code: ErrorCodes.REQUIRED_FIELD_MISSING }
    );
  }

  static invalidFormat(field: string, expected: string, received?: unknown): ValidationError {
    return new ValidationError(
      `Invalid format for ${field}. Expected ${expected}.`,
      field,
      received,
      { code: ErrorCodes.INVALID_FORMAT, expected }
    );
  }

  static maxLength(field: string, max: number, actual: number): ValidationError {
    return new ValidationError(
      `${field} must be ${max} characters or less (got ${actual}).`,
      field,
      undefined,
      { code: ErrorCodes.INVALID_INPUT, max, actual }
    );
  }

  static minLength(field: string, min: number, actual: number): ValidationError {
    return new ValidationError(
      `${field} must be at least ${min} characters (got ${actual}).`,
      field,
      undefined,
      { code: ErrorCodes.INVALID_INPUT, min, actual }
    );
  }

  static emptyString(field: string): ValidationError {
    return new ValidationError(
      `${field} must not be empty.`,
      field,
      '',
      { code: ErrorCodes.INVALID_INPUT }
    );
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(resourceType: string, resourceId: string, context?: Record<string, unknown>) {
    super(
      `${resourceType} with ID "${resourceId}" not found.`,
      ErrorCodes.NOT_FOUND,
      { ...context, resourceType, resourceId }
    );
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }

  static task(taskId: string): NotFoundError {
    return new NotFoundError('Task', taskId, { code: ErrorCodes.TASK_NOT_FOUND });
  }

  static artifact(taskId: string, phase: string): NotFoundError {
    return new NotFoundError(
      `${phase} artifact`,
      taskId,
      { code: ErrorCodes.ARTIFACT_NOT_FOUND, phase }
    );
  }

  static parent(parentId: string): NotFoundError {
    return new NotFoundError('Parent task', parentId, { code: ErrorCodes.PARENT_NOT_FOUND });
  }

  static dependency(depId: string): NotFoundError {
    return new NotFoundError('Dependency task', depId, { code: ErrorCodes.DEPENDENCY_NOT_FOUND });
  }
}

/**
 * Conflict error for operations that would create invalid states
 */
export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCodes.CIRCULAR_REFERENCE, context?: Record<string, unknown>) {
    super(message, code, context);
  }

  static circularReference(taskId: string, targetId: string): ConflictError {
    return new ConflictError(
      `Moving task would create a circular reference.`,
      ErrorCodes.CIRCULAR_REFERENCE,
      { taskId, targetId }
    );
  }

  static selfReference(taskId: string, operation: string): ConflictError {
    return new ConflictError(
      `Task cannot ${operation} itself.`,
      ErrorCodes.SELF_REFERENCE,
      { taskId, operation }
    );
  }
}

/**
 * Storage error for file system operations
 */
export class StorageError extends AppError {
  public readonly path?: string;
  public readonly operation?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.STORAGE_ERROR,
    path?: string,
    operation?: string,
    context?: Record<string, unknown>
  ) {
    super(message, code, { ...context, path, operation });
    this.path = path;
    this.operation = operation;
  }

  static readError(path: string, originalError?: Error): StorageError {
    return new StorageError(
      `Failed to read file: ${path}`,
      ErrorCodes.FILE_READ_ERROR,
      path,
      'read',
      { originalError: originalError?.message }
    );
  }

  static writeError(path: string, originalError?: Error): StorageError {
    return new StorageError(
      `Failed to write file: ${path}`,
      ErrorCodes.FILE_WRITE_ERROR,
      path,
      'write',
      { originalError: originalError?.message }
    );
  }

  static directoryError(path: string, originalError?: Error): StorageError {
    return new StorageError(
      `Directory operation failed: ${path}`,
      ErrorCodes.DIRECTORY_ERROR,
      path,
      'directory',
      { originalError: originalError?.message }
    );
  }

  static parseError(path: string, format: string, originalError?: Error): StorageError {
    return new StorageError(
      `Failed to parse ${format} file: ${path}`,
      ErrorCodes.PARSE_ERROR,
      path,
      'parse',
      { format, originalError: originalError?.message }
    );
  }

  static initializationError(path: string, message: string): StorageError {
    return new StorageError(
      message,
      ErrorCodes.INITIALIZATION_ERROR,
      path,
      'initialize'
    );
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard for specific error types
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

export function isConflictError(error: unknown): error is ConflictError {
  return error instanceof ConflictError;
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Wrap unknown errors in AppError
 */
export function wrapError(error: unknown, fallbackMessage?: string): AppError {
  if (isAppError(error)) {
    return error;
  }
  
  const message = getErrorMessage(error) || fallbackMessage || 'Unknown error';
  return new StorageError(message, ErrorCodes.UNKNOWN_ERROR);
}
