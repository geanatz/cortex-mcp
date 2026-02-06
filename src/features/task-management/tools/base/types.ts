import { McpToolHandler, McpToolResponse } from '../../../../types/common.js';

export interface ToolDefinition<TInput = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  readonly handler: McpToolHandler<TInput>;
}

export type ToolHandler<TInput = Record<string, unknown>, TOutput = McpToolResponse> = (
  input: TInput
) => Promise<TOutput>;
