import { z } from 'zod';
import { ValidationLimits } from '../../../../utils/validation.js';
import { validateWorkingDirectory, containsPathTraversal } from '../../../../utils/path-security.js';

// Base schemas without descriptions (for internal use)
const baseWorkingDirectorySchema = z.string()
  .min(1, 'Working directory is required')
  .max(ValidationLimits.MAX_WORKING_DIRECTORY_LENGTH, 'Working directory path is too long')
  .refine(
    (path) => !containsPathTraversal(path),
    'Working directory cannot contain path traversal sequences (..)'
  )
  .refine(
    (path) => {
      try {
        validateWorkingDirectory(path);
        return true;
      } catch {
        return false;
      }
    },
    'Working directory must be an absolute path without traversal sequences'
  );

// Export schema builder function
export function createWorkingDirectorySchema(description?: string) {
  if (description) {
    return baseWorkingDirectorySchema.describe(description);
  }
  return baseWorkingDirectorySchema;
}

// For backward compatibility
export const workingDirectorySchema = baseWorkingDirectorySchema;

/**
 * Task ID schema
 */
export const taskIdSchema = z.string()
  .min(1, 'Task ID is required')
  .max(ValidationLimits.TASK_ID_MAX_LENGTH, `Task ID must be ${ValidationLimits.TASK_ID_MAX_LENGTH} characters or less`);

/**
 * Task details schema
 */
export const taskDetailsSchema = z.string()
  .min(ValidationLimits.TASK_DETAILS_MIN_LENGTH, 'Task details cannot be empty')
  .max(ValidationLimits.TASK_DETAILS_MAX_LENGTH, `Task details must be ${ValidationLimits.TASK_DETAILS_MAX_LENGTH} characters or less`);

/**
 * Subtask details schema
 */
export const subtaskDetailsSchema = z.string()
  .min(1, 'Subtask details cannot be empty')
  .max(ValidationLimits.SUBTASK_DETAILS_MAX_LENGTH, `Subtask details must be ${ValidationLimits.SUBTASK_DETAILS_MAX_LENGTH} characters or less`);

/**
 * Tags schema
 */
export const tagsSchema = z.array(
  z.string()
    .min(ValidationLimits.TAG_MIN_LENGTH, 'Tag cannot be empty')
    .max(ValidationLimits.TAG_MAX_LENGTH, `Tag must be ${ValidationLimits.TAG_MAX_LENGTH} characters or less`)
)
  .max(ValidationLimits.MAX_TAGS, `Cannot have more than ${ValidationLimits.MAX_TAGS} tags`);

/**
 * Actual hours schema
 */
export const actualHoursSchema = z.number()
  .min(0, 'Actual hours cannot be negative')
  .max(ValidationLimits.MAX_ACTUAL_HOURS, `Actual hours cannot exceed ${ValidationLimits.MAX_ACTUAL_HOURS}`)
  .finite('Actual hours must be a finite number');

/**
 * Artifact content schema
 */
export const artifactContentSchema = z.string()
  .min(1, 'Content cannot be empty')
  .refine(
    (content) => {
      const byteLength = Buffer.byteLength(content, 'utf-8');
      return byteLength <= ValidationLimits.ARTIFACT_CONTENT_MAX_LENGTH;
    },
    `Content exceeds maximum size of ${ValidationLimits.ARTIFACT_CONTENT_MAX_LENGTH} bytes (10MB)`
  );

/**
 * Artifact error schema
 */
export const artifactErrorSchema = z.string()
  .max(ValidationLimits.ARTIFACT_ERROR_MAX_LENGTH, `Error message cannot exceed ${ValidationLimits.ARTIFACT_ERROR_MAX_LENGTH} characters`);

/**
 * Retries schema
 */
export const retriesSchema = z.number()
  .int('Retries must be an integer')
  .min(0, 'Retries cannot be negative')
  .max(ValidationLimits.MAX_RETRIES, `Retries cannot exceed ${ValidationLimits.MAX_RETRIES}`);
