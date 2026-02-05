/**
 * Handler wrapper functions for MCP tools
 * Provides middleware-style functionality for tool handlers
 */

import { z } from 'zod';
import { ToolHandler } from './types.js';
import { McpToolResponse, McpToolHandler } from '../../../../types/common.js';
import { createErrorResponse } from '../../../../utils/response-builder.js';

/**
 * Wraps a handler with error handling middleware
 * Catches any errors that occur during handler execution and returns a formatted error response
 * 
 * @template TInput - The input type for the handler
 * @template TOutput - The output type for the handler
 * @param handler - The handler function to wrap
 * @returns A new handler with error handling
 */
export function withErrorHandling<TInput, TOutput extends McpToolResponse>(
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    try {
      return await handler(input);
    } catch (error) {
      // Return a formatted error response
      const errorResponse = createErrorResponse(error);
      return errorResponse as TOutput;
    }
  };
}

/**
 * Wraps a handler with validation middleware
 * Validates input against a schema before passing it to the handler
 * 
 * @template TInput - The input type for the handler
 * @template TOutput - The output type for the handler
 * @param schema - The Zod schema to validate against
 * @param handler - The handler function to wrap
 * @returns A new handler with validation
 */
export function withValidation<TInput extends Record<string, unknown>, TOutput extends McpToolResponse>(
  schema: z.ZodType<TInput>,
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return async (input: Record<string, unknown>): Promise<TOutput> => {
    // Parse and validate the input
    const parsedInput = schema.parse(input);
    
    // Call the original handler with validated input
    return await handler(parsedInput as TInput);
  };
}

/**
 * Composes multiple handler wrappers together
 * Allows combining multiple middleware functions into a single handler
 * 
 * @param wrappers - An array of handler wrapper functions
 * @returns A composed handler wrapper
 */
export function compose<TInput extends Record<string, unknown>, TOutput extends McpToolResponse>(
  ...wrappers: ((handler: ToolHandler<TInput, TOutput>) => ToolHandler<TInput, TOutput>)[]
): (handler: ToolHandler<TInput, TOutput>) => ToolHandler<TInput, TOutput> {
  return (handler: ToolHandler<TInput, TOutput>): ToolHandler<TInput, TOutput> => {
    // Apply wrappers from right to left (last to first)
    return wrappers.reduceRight(
      (acc, curr) => curr(acc),
      handler as ToolHandler<TInput, TOutput>
    );
  };
}

/**
 * Creates a handler with both validation and error handling
 * Combines both middleware functions for common use cases
 * 
 * @template TInput - The input type for the handler
 * @param schema - The Zod schema to validate against
 * @param handler - The handler function to wrap
 * @returns A new handler with validation and error handling
 */
export function withValidationAndErrorHandling<TInput extends Record<string, unknown>, TOutput extends McpToolResponse>(
  schema: z.ZodType<TInput>,
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return compose<TInput, TOutput>(
    (h) => withValidation(schema, h),
    (h) => withErrorHandling(h)
  )(handler);
}

/**
 * Type guard to check if a value is a valid MCP tool handler
 * 
 * @param value - The value to check
 * @returns True if the value is a valid MCP tool handler
 */
export function isMcpToolHandler<TInput extends Record<string, unknown>>(
  value: unknown
): value is McpToolHandler<TInput> {
  return typeof value === 'function';
}

/**
 * Middleware to log handler execution
 * Logs input and output of handler execution for debugging purposes
 * 
 * @template TInput - The input type for the handler
 * @template TOutput - The output type for the handler
 * @param handler - The handler function to wrap
 * @param logger - Optional logger function (defaults to console.log)
 * @returns A new handler with logging
 */
export function withLogging<TInput, TOutput extends McpToolResponse>(
  handler: ToolHandler<TInput, TOutput>,
  logger: (message: string) => void = console.log
): ToolHandler<TInput, TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    logger(`Executing handler with input: ${JSON.stringify(input)}`);
    
    const startTime = Date.now();
    try {
      const result = await handler(input);
      const duration = Date.now() - startTime;
      logger(`Handler completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger(`Handler failed after ${duration}ms: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };
}

/**
 * Middleware to add timing information to responses
 * Adds execution time to the response metadata
 * 
 * @template TInput - The input type for the handler
 * @template TOutput - The output type for the handler
 * @param handler - The handler function to wrap
 * @returns A new handler with timing information
 */
export function withTiming<TInput, TOutput extends McpToolResponse>(
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    const startTime = Date.now();
    const result = await handler(input);
    const duration = Date.now() - startTime;
    
    // If the result is an MCP response, we could add timing info
    // For now, we just return the original result
    return result;
  };
}

/**
 * Middleware to handle authorization
 * Checks if the user is authorized to perform the operation
 * 
 * @template TInput - The input type for the handler
 * @template TOutput - The output type for the handler
 * @param handler - The handler function to wrap
 * @param authorize - Authorization function that returns true if authorized
 * @returns A new handler with authorization check
 */
export function withAuthorization<TInput, TOutput extends McpToolResponse>(
  handler: ToolHandler<TInput, TOutput>,
  authorize: (input: TInput) => boolean | Promise<boolean>
): ToolHandler<TInput, TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    const authorized = await authorize(input);
    if (!authorized) {
      throw new Error('Unauthorized: Insufficient permissions to perform this operation');
    }
    
    return await handler(input);
  };
}

/**
 * Middleware to handle rate limiting
 * Limits how frequently a handler can be called
 * 
 * @template TInput - The input type for the handler
 * @template TOutput - The output type for the handler
 * @param handler - The handler function to wrap
 * @param limit - Maximum number of calls per window
 * @param windowMs - Time window in milliseconds
 * @returns A new handler with rate limiting
 */
export function withRateLimiting<TInput, TOutput extends McpToolResponse>(
  handler: ToolHandler<TInput, TOutput>,
  limit: number,
  windowMs: number
): ToolHandler<TInput, TOutput> {
  const calls: { timestamp: number }[] = [];
  
  return async (input: TInput): Promise<TOutput> => {
    const now = Date.now();
    
    // Remove calls outside the time window
    while (calls.length > 0 && calls[0].timestamp < now - windowMs) {
      calls.shift();
    }
    
    // Check if limit exceeded
    if (calls.length >= limit) {
      throw new Error(`Rate limit exceeded: ${limit} calls per ${windowMs}ms`);
    }
    
    // Record this call
    calls.push({ timestamp: now });
    
    return await handler(input);
  };
}

/**
 * Creates a conditional handler that applies middleware based on a condition
 * 
 * @template TInput - The input type for the handler
 * @template TOutput - The output type for the handler
 * @param condition - Condition function that determines if middleware should be applied
 * @param middleware - Middleware to apply if condition is true
 * @param handler - The handler function to wrap
 * @returns A new handler with conditional middleware
 */
export function withConditionalMiddleware<TInput, TOutput extends McpToolResponse>(
  condition: (input: TInput) => boolean,
  middleware: (handler: ToolHandler<TInput, TOutput>) => ToolHandler<TInput, TOutput>,
  handler: ToolHandler<TInput, TOutput>
): ToolHandler<TInput, TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    if (condition(input)) {
      return await middleware(handler)(input);
    }
    return await handler(input);
  };
}