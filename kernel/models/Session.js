import { BaseModel } from './BaseModel.js';

export class Session extends BaseModel {
  constructor(options = {}) {
    super(options);
    this.title = options.title || '新对话';
    this.messages = [];
    this.reasoningEffort = options.reasoningEffort || 'medium';
    this.model = options.model || null;
    this.createdAt = options.createdAt || Date.now();
    this.updatedAt = options.updatedAt || this.createdAt;
    if (Array.isArray(options.messages)) {
      options.messages.forEach(m => this.messages.push(m));
    }
  }

  addMessage(message) { this.messages.push(message); this.touch(); return this; }
  getMessage(id) { return this.messages.find(m => m.id === id) || null; }
  removeMessage(id) { const i = this.messages.findIndex(m => m.id === id); if (i !== -1) this.messages.splice(i, 1); this.touch(); return this; }
  clearMessages() { this.messages = []; this.touch(); return this; }

  toJSON() {
    return {
      ...super.toJSON(),
      title: this.title,
      messages: this.messages.map(m => m.toJSON()),
      reasoningEffort: this.reasoningEffort,
      model: this.model,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export default Session;