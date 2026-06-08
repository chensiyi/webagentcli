class GetPageMetadataTool extends window.IToolService {
  constructor() {
    super();
    const definition = new window.ToolDefinition({
      name: 'get_page_metadata',
      description: '获取当前页面的元数据（URL、标题、favicon）',
      parameters: { type: 'object', properties: {} },
      requiresApproval: false
    });
    const handler = async (args, context) => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      return { url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl || null };
    };
    this.register(definition, handler);
  }
}
if (typeof window !== 'undefined') window.GetPageMetadataTool = GetPageMetadataTool;