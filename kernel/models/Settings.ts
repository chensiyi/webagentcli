import { BaseModel } from './BaseModel.js';

export class Settings extends BaseModel {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
  reasoningEffort: string;
  autoContextTruncation: boolean;
  contextWindowSize: number;
  maxTokens: number;
  contextWindowRatio: number;
  temperature: number | null;
  metadata: Record<string, any>;

  constructor(options: Record<string, any> = {}) {
    super(options);
    this.provider = options.provider || 'openai';
    this.endpoint = options.endpoint || '';
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'gpt-4o';
    this.reasoningEffort = options.reasoningEffort || 'medium';
    this.autoContextTruncation = options.autoContextTruncation !== false;
    this.contextWindowSize = options.contextWindowSize || 20;
    this.maxTokens = options.maxTokens || 2000;
    this.contextWindowRatio = options.contextWindowRatio || 0.8;
    this.temperature = options.temperature ?? null;
    this.metadata = options.metadata || {};
  }

  toJSON() {
    return {
      ...super.toJSON(),
      provider: this.provider, endpoint: this.endpoint, apiKey: this.apiKey,
      model: this.model, reasoningEffort: this.reasoningEffort,
      autoContextTruncation: this.autoContextTruncation,
      contextWindowSize: this.contextWindowSize,
      maxTokens: this.maxTokens, contextWindowRatio: this.contextWindowRatio,
      temperature: this.temperature, metadata: this.metadata
    };
  }
}