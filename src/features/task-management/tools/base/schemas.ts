/**
 * Reusable Zod schemas for MCP tool validation
 * Provides common validation schemas and helper functions
 */

import { z } from 'zod';
import { ValidationLimits, Schemas } from '../../../../utils/validation.js';

/**
 * Schema for working directory validation
 */
export const workingDirectorySchema = z.string().min(1, 'Working directory is required');

/**
 * Schema for task ID validation
 */
export const taskIdSchema = z.string()
  .min(1, 'Task ID is required')
  .max(ValidationLimits.TASK_ID_MAX_LENGTH);

/**
 * Schema for optional parent ID validation
 */
export const parentIdSchema = z.string()
  .min(1, 'Parent ID must not be empty')
  .max(ValidationLimits.TASK_ID_MAX_LENGTH)
  .optional();

/**
 * Schema for confirmation flag validation
 */
export const confirmSchema = z.literal(true, {
  errorMap: () => ({ message: 'Confirmation is required for this operation' })
});

/**
 * Schema for task status validation
 */
export const statusSchema = z.enum(['pending', 'in_progress', 'done']);

/**
 * Schema for optional tags array validation
 */
export const tagsSchema = z.array(z.string().min(1).max(ValidationLimits.TAG_MAX_LENGTH))
  .max(ValidationLimits.MAX_TAGS)
  .optional();

/**
 * Schema for artifact phase validation
 */
export const phaseSchema = z.enum(['explore', 'search', 'plan', 'build', 'test']);

/**
 * Schema for artifact status validation
 */
export const artifactStatusSchema = z.enum(['pending', 'in-progress', 'completed', 'failed', 'skipped']);

/**
 * Schema for operation validation
 */
export const operationSchema = z.enum(['create', 'get', 'update', 'delete', 'list']);

/**
 * Schema for optional content validation
 */
export const contentSchema = z.string().min(1).optional();

/**
 * Helper function to create a working directory parameter schema
 */
export function createWorkingDirectoryParam(required: boolean = true): z.ZodString | z.ZodOptional<z.ZodString> {
  if (required) {
    return z.string().min(1, 'Working directory is required');
  }
  return z.string().optional();
}

/**
 * Helper function to create a task ID parameter schema
 */
export function createTaskIdParam(required: boolean = true): z.ZodString | z.ZodOptional<z.ZodString> {
  if (required) {
    return z.string()
      .min(1, 'Task ID is required')
      .max(ValidationLimits.TASK_ID_MAX_LENGTH);
  }
  return z.string()
    .max(ValidationLimits.TASK_ID_MAX_LENGTH)
    .optional();
}

/**
 * Helper function to create a parent ID parameter schema
 */
export function createParentIdParam(required: boolean = false): z.ZodString | z.ZodOptional<z.ZodString> {
  if (required) {
    return z.string()
      .min(1, 'Parent ID is required')
      .max(ValidationLimits.TASK_ID_MAX_LENGTH);
  }
  return z.string()
    .max(ValidationLimits.TASK_ID_MAX_LENGTH)
    .optional();
}

/**
 * Helper function to create a confirmation parameter schema
 */
export function createConfirmParam(message: string = 'Confirmation is required'): z.ZodLiteral<true> {
  return z.literal(true, {
    errorMap: () => ({ message })
  });
}

/**
 * Helper function to create a status parameter schema
 */
export function createStatusParam(defaultValue?: 'pending' | 'in_progress' | 'done'): z.ZodEnum<['pending', 'in_progress', 'done']> | z.ZodDefault<z.ZodEnum<['pending', 'in_progress', 'done']>> {
  const schema = z.enum(['pending', 'in_progress', 'done']);
  return defaultValue ? schema.default(defaultValue) : schema;
}

/**
 * Helper function to create a tags parameter schema
 */
export function createTagsParam(): z.ZodArray<z.ZodString, 'many'> | z.ZodOptional<z.ZodArray<z.ZodString, 'many'>> {
  return z.array(z.string().min(1).max(ValidationLimits.TAG_MAX_LENGTH))
    .max(ValidationLimits.MAX_TAGS)
    .optional();
}

/**
 * Helper function to create an operation parameter schema
 */
export function createOperationParam(): z.ZodEnum<['create', 'get', 'update', 'delete', 'list']> {
  return z.enum(['create', 'get', 'update', 'delete', 'list']);
}

/**
 * Helper function to create a phase parameter schema
 */
export function createPhaseParam(): z.ZodEnum<['explore', 'search', 'plan', 'build', 'test']> {
  return z.enum(['explore', 'search', 'plan', 'build', 'test']);
}

/**
 * Helper function to create an artifact status parameter schema
 */
export function createArtifactStatusParam(): z.ZodEnum<['pending', 'in-progress', 'completed', 'failed', 'skipped']> {
  return z.enum(['pending', 'in-progress', 'completed', 'failed', 'skipped']);
}

/**
 * Helper function to create a content parameter schema
 */
export function createContentParam(required: boolean = false): z.ZodString | z.ZodOptional<z.ZodString> {
  if (required) {
    return z.string().min(1, 'Content is required');
  }
  return z.string().optional();
}

/**
 * Common parameter combinations
 */
export const CommonParams = {
  workingDirectory: () => ({ workingDirectory: createWorkingDirectoryParam(true) }),
  taskId: () => ({ taskId: createTaskIdParam(true) }),
  optionalTaskId: () => ({ taskId: createTaskIdParam(false) }),
  parentId: () => ({ parentId: createParentIdParam(false) }),
  optionalParentId: () => ({ parentId: createParentIdParam(false) }),
  confirm: (message?: string) => ({ confirm: createConfirmParam(message) }),
  status: (defaultValue?: 'pending' | 'in_progress' | 'done') => ({ status: createStatusParam(defaultValue) }),
  tags: () => ({ tags: createTagsParam() }),
  operation: () => ({ operation: createOperationParam() }),
  phase: () => ({ phase: createPhaseParam() }),
  artifactStatus: () => ({ status: createArtifactStatusParam() }),
  content: (required: boolean = false) => ({ content: createContentParam(required) }),
} as const;

/**
 * Combined parameter schemas for common use cases
 */
export const BaseToolParams = {
  required: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
  },
  optional: {
    parentId: parentIdSchema,
  },
  confirm: confirmSchema,
};

/**
 * Task operation parameter schemas
 */
export const TaskOperationParams = {
  create: {
    workingDirectory: workingDirectorySchema,
    details: Schemas.taskDetails,
    parentId: parentIdSchema,
    status: statusSchema.optional().default('pending'),
    tags: tagsSchema,
  },
  update: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
    details: Schemas.taskDetails.optional(),
    parentId: parentIdSchema,
    status: statusSchema.optional(),
    tags: tagsSchema,
  },
  delete: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
    confirm: confirmSchema,
  },
  get: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
  },
  list: {
    workingDirectory: workingDirectorySchema,
    parentId: parentIdSchema,
    status: z.array(statusSchema).optional().or(statusSchema.optional()),
    tags: tagsSchema,
  },
} as const;

/**
 * Artifact operation parameter schemas
 */
export const ArtifactOperationParams = {
  create: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
    phase: phaseSchema,
    content: contentSchema,
    status: artifactStatusSchema.optional().default('completed'),
  },
  update: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
    phase: phaseSchema,
    content: contentSchema.optional(),
    status: artifactStatusSchema.optional(),
  },
  delete: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
    phase: phaseSchema,
    confirm: confirmSchema,
  },
  get: {
    workingDirectory: workingDirectorySchema,
    taskId: taskIdSchema,
    phase: phaseSchema,
  },
} as const;