import { z } from 'zod';
import { ToolHandler } from './types.js';
import { McpToolResponse } from '../../../../types/common.js';
import { createErrorResponse } from '../../../../utils/response-builder.js';

export function withErrorHandling<TInput, TOutput extends McpToolResponse>(
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    try {
      return await handler(input);
    } catch (error) {
      return createErrorResponse(error) as TOutput;
    }
  };
}

export function withValidation<TInput extends Record<string, unknown>, TOutput extends McpToolResponse>(
  schema: z.ZodType<TInput>,
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return async (input: Record<string, unknown>): Promise<TOutput> => {
    const parsedInput = schema.parse(input);
    return await handler(parsedInput as TInput);
  };
}

export function withValidationAndErrorHandling<TInput extends Record<string, unknown>, TOutput extends McpToolResponse>(
  schema: z.ZodType<TInput>,
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return withErrorHandling(withValidation(schema, handler));
}
