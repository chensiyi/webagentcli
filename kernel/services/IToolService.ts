export class IToolService {
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