import { McpToolResponse } from '../../../../types/common.js';

/**
 * Definition for a tool that can be registered with the MCP server.
 * The handler uses a permissive input type because the MCP SDK
 * validates params against the zod schemas at the protocol layer.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly handler: (params: any) => Promise<McpToolResponse>;
}

export type ToolHandler<TInput = Record<string, unknown>, TOutput = McpToolResponse> = (
  input: TInput
) => Promise<TOutput>;
