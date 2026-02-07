export interface McpTextContent {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

export interface McpToolResponse {
  content: McpTextContent[];
  isError?: boolean;
  [key: string]: unknown;
}
