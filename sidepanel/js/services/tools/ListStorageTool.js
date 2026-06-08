class ListStorageTool extends window.IToolService {
  constructor() {
    super();
    const definition = new window.ToolDefinition({
      name: 'list_storage',
      description: '列出 chrome.storage.local 中所有键名',
      parameters: { type: 'object', properties: {} },
      requiresApproval: false
    });
    const handler = async () => {
      const all = await chrome.storage.local.get(null);
      return Object.keys(all);
    };
    this.register(definition, handler);
  }
}
if (typeof window !== 'undefined') window.ListStorageTool = ListStorageTool;