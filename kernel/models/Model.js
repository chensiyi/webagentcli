import { BaseModel } from './BaseModel.js';

export class Model extends BaseModel {
  constructor(options = {}) {
    super(options);
    this.id = options.id || '';
    this.name = options.name || '';
    this.provider = options.provider || '';
    this.capabilities = options.capabilities || [];
    this.contextLength = options.contextLength || 8192;
    this.supportsReasoning = options.supportsReasoning || false;
    this.supportsTools = options.supportsTools || false;
    this.supportsVision = options.supportsVision || false;
    this.pricing = options.pricing || null;
  }

  supports(name) { return this.capabilities.includes(name); }
}

export default Model;