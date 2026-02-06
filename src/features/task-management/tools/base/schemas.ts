import { z } from 'zod';
import { ValidationLimits } from '../../../../utils/validation.js';

export const workingDirectorySchema = z.string().min(1, 'Working directory is required');

export const taskIdSchema = z.string()
  .min(1, 'Task ID is required')
  .max(ValidationLimits.TASK_ID_MAX_LENGTH);
