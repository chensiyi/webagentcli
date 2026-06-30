export class ToolDefinition {
  name: string;
  description: string;
  capabilities: string[];
  inputSchema: unknown;
  outputSchema: unknown;
  enabled: boolean;
  metadata: Record<string, unknown>;

  constructor(opts: Record<string, unknown> = {}) {
    this.name = (opts.name as string) || '';
    this.description = (opts.description as string) || '';
    this.capabilities = (opts.capabilities as string[]) || [];
    this.inputSchema = opts.inputSchema || null;
    this.outputSchema = opts.outputSchema || null;
    this.enabled = (opts.enabled as boolean) !== false;
    this.metadata = (opts.metadata as Record<string, unknown>) || {};
  }

  toOpenAIFunction(): { type: string; function: { name: string; description: string; parameters: unknown } } {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.inputSchema || { type: 'object', properties: {} }
      }
    };
  }
}
