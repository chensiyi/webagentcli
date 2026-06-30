import { BaseModel } from './BaseModel.js';

export class Model extends BaseModel {
  name: string;
  provider: string;
  capabilities: string[];
  contextLength: number;
  supportsReasoning: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  pricing: unknown;

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    this.id = (options.id as string) || '';
    this.name = (options.name as string) || '';
    this.provider = (options.provider as string) || '';
    this.capabilities = (options.capabilities as string[]) || [];
    this.contextLength = (options.contextLength as number) || 8192;
    this.supportsReasoning = (options.supportsReasoning as boolean) || false;
    this.supportsTools = (options.supportsTools as boolean) || false;
    this.supportsVision = (options.supportsVision as boolean) || false;
    this.pricing = options.pricing || null;
  }

  supports(name: string): boolean { return this.capabilities.includes(name); }
}