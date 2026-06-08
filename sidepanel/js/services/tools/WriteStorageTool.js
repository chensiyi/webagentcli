class WriteStorageTool extends window.IToolService {
  constructor() {
    super();
    const definition = new window.ToolDefinition({
      name: 'write_storage',
      description: '向 chrome.storage.local 写入键值',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '键名' },
          value: { type: 'string', description: '值（会被 JSON 序列化）' }
        },
        required: ['key', 'value']
      },
      requiresApproval: true
    });
    const handler = async (args) => {
      let val = args.value;
      try { val = JSON.parse(val); } catch (e) { /* 保持字符串 */ }
      await chrome.storage.local.set({ [args.key]: val });
      return { key: args.key, saved: true };
    };
    this.register(definition, handler);
  }
}
if (typeof window !== 'undefined') window.WriteStorageTool = WriteStorageTool;