export class Process {
  constructor(name, options = {}) {
    this.id = options.id || `proc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.name = name;
    this.status = options.status || 'pending';
    this.output = options.output || [];
    this.metadata = options.metadata || {};
  }

  setStatus(status) { this.status = status; return this; }
  appendOutput(text) { this.output.push(text); return this; }
}

export default Process;