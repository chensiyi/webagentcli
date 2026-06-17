export class ToolDefinition {
  constructor(opts = {}) {
    this.name = opts.name || '';
    this.description = opts.description || '';
    this.capabilities = opts.capabilities || [];
    this.inputSchema = opts.inputSchema || null;
    this.outputSchema = opts.outputSchema || null;
    this.enabled = opts.enabled !== false;
    this.metadata = opts.metadata || {};
  }

  toOpenAIFunction() {
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
export default ToolDefinition;