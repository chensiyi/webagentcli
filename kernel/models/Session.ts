import { BaseModel } from './BaseModel.js';

export class Session extends BaseModel {
  title: string;
  messages: unknown[];
  reasoningEffort: string;
  model: unknown;

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.title = (options.title as string) || '新对话';
    this.messages = [];
    this.reasoningEffort = (options.reasoningEffort as string) || 'medium';
    this.model = options.model || null;
    this.createdAt = (options.createdAt as number) || Date.now();
    this.updatedAt = (options.updatedAt as number) || this.createdAt;
    if (Array.isArray(options.messages)) {
      options.messages.forEach(m => this.messages.push(m));
    }
  }

  addMessage(message: unknown): this { this.messages.push(message); this.touch(); return this; }
  getMessage(id: string): unknown { return this.messages.find((m: { id: string }) => m.id === id) || null; }
  removeMessage(id: string): this { const i = this.messages.findIndex((m: { id: string }) => m.id === id); if (i !== -1) this.messages.splice(i, 1); this.touch(); return this; }
  clearMessages(): this { this.messages = []; this.touch(); return this; }

  toJSON(): Record<string, unknown> {
    return {
      ...(super.toJSON() as Record<string, unknown>),
      title: this.title,
      messages: this.messages.map(m => (m as { toJSON: () => unknown }).toJSON()),
      reasoningEffort: this.reasoningEffort,
      model: this.model,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}