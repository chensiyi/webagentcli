import { ToolDefinition } from '../models/ToolDefinition.js';
import { ToolCall } from '../models/ToolCall.js';
import { ToolResult } from '../models/ToolResult.js';

export class IToolService {
  definition: ToolDefinition;
  enabled: boolean;
  handler: ((call: ToolCall, ctx: unknown) => Promise<ToolResult> | ToolResult) | null;

  constructor(definition) { this.definition = definition; this.enabled = true; }
  async invoke(call, ctx) { throw new Error('Not implemented'); }
  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
  register(definition, handler) {
    this.definition = definition;
    this.handler = handler;
    return this;
  }
}