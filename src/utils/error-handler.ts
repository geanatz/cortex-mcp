/**
 * Common error handling utility for MCP tool responses
 */
export function createErrorResponse(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  return {
    content: [{
      type: 'text',
      text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }],
    isError: true
  };
}