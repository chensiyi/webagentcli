class ReadStorageTool extends window.IToolService {
  constructor() {
    super();
    const definition = new window.ToolDefinition({
      name: 'read_storage',
      description: '读取 chrome.storage.local 中的指定键值',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '要读取的键名（必填）' }
        },
        required: ['key']
      },
      requiresApproval: false
    });
    const handler = async (args) => {
      if (!args.key) throw new Error('key is required');
      const result = await chrome.storage.local.get(args.key);
      return result[args.key] ?? null;
    };
    this.register(definition, handler);
  }
}
if (typeof window !== 'undefined') window.ReadStorageTool = ReadStorageTool;