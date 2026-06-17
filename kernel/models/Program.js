export class Program {
  constructor(name, options = {}) {
    this.id = options.id || `prog_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.name = name;
    this.metadata = options.metadata || {};
  }
}

export default Program;