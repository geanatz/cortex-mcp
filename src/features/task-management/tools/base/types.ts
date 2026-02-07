import { McpToolHandler, McpToolResponse } from '../../../../types/common.js';

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, any>;
  readonly handler: McpToolHandler<any>;
}

export type ToolHandler<TInput = Record<string, unknown>, TOutput = McpToolResponse> = (
  input: TInput
) => Promise<TOutput>;
