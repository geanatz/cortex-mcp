export interface McpTextContent {
  type: 'text';
  text: string;
  [x: string]: unknown;
}

export interface McpToolResponse {
  content: McpTextContent[];
  isError?: boolean;
  [x: string]: unknown;
}

export type AsyncHandler<TParams, TResult> = (params: TParams) => Promise<TResult>;

export type McpToolHandler<TParams = Record<string, unknown>> = AsyncHandler<TParams, McpToolResponse>;
