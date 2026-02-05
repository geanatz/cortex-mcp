/**
 * Centralized validation utilities
 * Provides reusable validators and validation helpers
 */

import { z } from 'zod';
import { ValidationError } from '../errors/errors.js';

/**
 * Common validation constants
 */
export const ValidationLimits = {
  TASK_DETAILS_MAX_LENGTH: 2000,
  TASK_DETAILS_MIN_LENGTH: 1,
  TAG_MAX_LENGTH: 50,
  TAG_MIN_LENGTH: 1,
  MAX_TAGS: 20,
  MAX_DEPENDENCIES: 50,
  TASK_ID_MAX_LENGTH: 100,
} as const;

/**
 * Common Zod schemas for reuse
 */
export const Schemas = {
  /** Non-empty trimmed string */
  nonEmptyString: z.string().min(1).transform(s => s.trim()),
  
  /** Optional non-empty string */
  optionalString: z.string().optional().transform(s => s?.trim() || undefined),
  
  /** Task ID schema */
  taskId: z.string()
    .min(1, 'Task ID is required')
    .max(ValidationLimits.TASK_ID_MAX_LENGTH),
  
  /** Task details schema */
  taskDetails: z.string()
    .min(ValidationLimits.TASK_DETAILS_MIN_LENGTH, 'Task details are required')
    .max(ValidationLimits.TASK_DETAILS_MAX_LENGTH, `Task details must be ${ValidationLimits.TASK_DETAILS_MAX_LENGTH} characters or less`),
  
  /** Task status schema */
  taskStatus: z.enum(['pending', 'in_progress', 'done']),
  
  /** Artifact status schema */
  artifactStatus: z.enum(['pending', 'in-progress', 'completed', 'failed', 'skipped']),
  
  /** Artifact phase schema */
  artifactPhase: z.enum(['explore', 'search', 'plan', 'build', 'test']),
  
  /** Tag schema */
  tag: z.string()
    .min(ValidationLimits.TAG_MIN_LENGTH)
    .max(ValidationLimits.TAG_MAX_LENGTH),
  
  /** Tags array schema */
  tags: z.array(z.string().min(1).max(ValidationLimits.TAG_MAX_LENGTH))
    .max(ValidationLimits.MAX_TAGS)
    .optional(),
  
  /** Dependencies array schema */
  dependencies: z.array(z.string().min(1))
    .max(ValidationLimits.MAX_DEPENDENCIES)
    .optional(),
  
  /** Boolean confirmation */
  confirm: z.boolean().refine(val => val === true, {
    message: 'Confirmation is required',
  }),
  
  /** Positive number */
  positiveNumber: z.number().min(0),
  
  /** Working directory */
  workingDirectory: z.string().min(1, 'Working directory is required'),
} as const;

/**
 * Validation result type
 */
export type ValidationResult<T> = 
  | { valid: true; data: T }
  | { valid: false; error: ValidationError };

/**
 * Validate a value against a Zod schema
 */
export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fieldName: string = 'value'
): ValidationResult<T> {
  const result = schema.safeParse(value);
  
  if (result.success) {
    return { valid: true, data: result.data };
  }
  
  const firstError = result.error.errors[0];
  const path = firstError.path.length > 0 ? firstError.path.join('.') : fieldName;
  
  return {
    valid: false,
    error: new ValidationError(firstError.message, path, value),
  };
}

/**
 * Validate and throw if invalid
 */
export function validateOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fieldName: string = 'value'
): T {
  const result = validate(schema, value, fieldName);
  
  if (!result.valid) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Common validation functions
 */
export const Validators = {
  /**
   * Validate task ID is provided and not empty
   */
  taskId(id: unknown): ValidationResult<string> {
    if (typeof id !== 'string' || !id.trim()) {
      return {
        valid: false,
        error: ValidationError.requiredField('Task ID'),
      };
    }
    return { valid: true, data: id.trim() };
  },

  /**
   * Validate task details
   */
  taskDetails(details: unknown): ValidationResult<string> {
    if (typeof details !== 'string' || !details.trim()) {
      return {
        valid: false,
        error: ValidationError.requiredField('Task details'),
      };
    }
    
    const trimmed = details.trim();
    
    if (trimmed.length > ValidationLimits.TASK_DETAILS_MAX_LENGTH) {
      return {
        valid: false,
        error: ValidationError.maxLength(
          'Task details',
          ValidationLimits.TASK_DETAILS_MAX_LENGTH,
          trimmed.length
        ),
      };
    }
    
    return { valid: true, data: trimmed };
  },

  /**
   * Validate artifact content
   */
  artifactContent(content: unknown): ValidationResult<string> {
    if (typeof content !== 'string' || !content.trim()) {
      return {
        valid: false,
        error: ValidationError.requiredField('Content'),
      };
    }
    return { valid: true, data: content.trim() };
  },

  /**
   * Validate confirmation flag
   */
  confirmation(confirm: unknown, action: string): ValidationResult<true> {
    if (confirm !== true) {
      return {
        valid: false,
        error: new ValidationError(
          `You must set confirm to true to ${action}.`,
          'confirm',
          confirm
        ),
      };
    }
    return { valid: true, data: true };
  },

  /**
   * Validate at least one field is provided for update
   */
  hasUpdates(updates: Record<string, unknown>): ValidationResult<Record<string, unknown>> {
    const hasValue = Object.values(updates).some(v => v !== undefined);
    
    if (!hasValue) {
      return {
        valid: false,
        error: new ValidationError(
          'At least one field must be provided for update.',
          'updates'
        ),
      };
    }
    
    return { valid: true, data: updates };
  },
} as const;

/**
 * Combine multiple validation results
 */
export function combineValidations<T extends Record<string, unknown>>(
  validations: { [K in keyof T]: ValidationResult<T[K]> }
): ValidationResult<T> {
  const result: Partial<T> = {};
  
  for (const [key, validation] of Object.entries(validations)) {
    if (!validation.valid) {
      return validation as ValidationResult<T>;
    }
    result[key as keyof T] = (validation as { valid: true; data: T[keyof T] }).data;
  }
  
  return { valid: true, data: result as T };
}

/**
 * Create a validation chain that short-circuits on first error
 */
export function validationChain<T>(): ValidationChain<T> {
  return new ValidationChain<T>();
}

class ValidationChain<T> {
  private validations: Array<() => ValidationResult<unknown>> = [];
  private results: Map<string, unknown> = new Map();

  add<K extends string, V>(
    key: K,
    validator: () => ValidationResult<V>
  ): ValidationChain<T & Record<K, V>> {
    this.validations.push(() => {
      const result = validator();
      if (result.valid) {
        this.results.set(key, result.data);
      }
      return result;
    });
    return this as unknown as ValidationChain<T & Record<K, V>>;
  }

  run(): ValidationResult<T> {
    for (const validate of this.validations) {
      const result = validate();
      if (!result.valid) {
        return result as ValidationResult<T>;
      }
    }
    
    return {
      valid: true,
      data: Object.fromEntries(this.results) as T,
    };
  }
}
