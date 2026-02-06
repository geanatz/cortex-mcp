import { McpToolResponse, McpTextContent } from '../types/common.js';
import { isAppError, getErrorMessage } from '../errors/errors.js';

function textContent(text: string): McpTextContent {
  return { type: 'text' as const, text };
}

export function successResponse(text: string): McpToolResponse {
  return {
    content: [textContent(text)],
  };
}

export function errorResponse(text: string): McpToolResponse {
  return {
    content: [textContent(`Error: ${text}`)],
    isError: true,
  };
}

export function createErrorResponse(error: unknown): McpToolResponse {
  const message = getErrorMessage(error);
  return errorResponse(message);
}
