/**
 * ManageUserScriptsTool - 用户脚本管理工具
 * 允许 AI 查看、安装、编辑、启用、禁用和删除用户脚本
 * 通过 kernel 的 storageAdapter 访问 chrome.storage，不直接调用 chrome API
 */
import { IToolService } from '../../../kernel/services/IToolService.js';
import { ToolDefinition } from '../../../kernel/models/ToolDefinition.js';

const STORAGE_KEY = 'user_scripts';

class ManageUserScriptsTool extends IToolService {
  constructor() {
    super();
    const definition = new ToolDefinition({
      name: 'manage_user_scripts',
      description: '查看、安装、编辑、启用、禁用和删除用户脚本',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '操作类型：list, install, update, toggle, delete',
            enum: ['list', 'install', 'update', 'toggle', 'delete']
          },
          code: { type: 'string', description: '脚本代码（install/update 时需要）' },
          id: { type: 'string', description: '脚本 ID（update/toggle/delete 时需要）' },
          enabled: { type: 'boolean', description: '启用/禁用（toggle 时需要）' }
        },
        required: ['action']
      },
      requiresApproval: true
    });
    const handler = async (args, context) => {
      const storage = context?.kernel?.getStorageManager?.()
                   || context?.kernel?.get?.('storageManager');
      if (!storage) throw new Error('Storage manager not available');

      const getAllScripts = () => storage.get(STORAGE_KEY).then(v => v || []);
      const saveScripts = (scripts) => storage.set(STORAGE_KEY, scripts);

      const parseMetadata = (code) => {
        const metadata = { name: '', namespace: '', version: '', description: '', author: '', match: [], grant: [] };
        const match = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
        if (!match) throw new Error('无效的 UserScript 格式');
        const block = match[1];
        ['name','namespace','version','description','author'].forEach(k => {
          const m = block.match(new RegExp('@'+k+'\\s+(.+)'));
          if (m) metadata[k] = m[1].trim();
        });
        const matchRegex = /@match\s+(.+)/g;
        let m; while ((m = matchRegex.exec(block)) !== null) metadata.match.push(m[1].trim());
        const grantRegex = /@grant\s+(.+)/g;
        let g; while ((g = grantRegex.exec(block)) !== null) metadata.grant.push(g[1].trim());
        if (!metadata.name) metadata.name = '未命名脚本';
        return metadata;
      };

      const installScript = async (code) => {
        const meta = parseMetadata(code);
        const id = `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const script = { id, name: meta.name, namespace: meta.namespace, version: meta.version, description: meta.description, author: meta.author, match: meta.match, grant: meta.grant, enabled: true, code, createdAt: Date.now(), updatedAt: Date.now() };
        const scripts = await getAllScripts();
        scripts.push(script);
        await saveScripts(scripts);
        return script;
      };

      const updateScriptCode = async (id, code) => {
        const scripts = await getAllScripts();
        const idx = scripts.findIndex(s => s.id === id);
        if (idx === -1) throw new Error('脚本不存在');
        const meta = parseMetadata(code);
        scripts[idx] = { ...scripts[idx], name: meta.name, namespace: meta.namespace, version: meta.version, description: meta.description, author: meta.author, match: meta.match, grant: meta.grant, code, updatedAt: Date.now() };
        await saveScripts(scripts);
        return scripts[idx];
      };

      const toggleScript = async (id, enabled) => {
        const scripts = await getAllScripts();
        const idx = scripts.findIndex(s => s.id === id);
        if (idx === -1) throw new Error('脚本不存在');
        scripts[idx].enabled = enabled;
        scripts[idx].updatedAt = Date.now();
        await saveScripts(scripts);
        return scripts[idx];
      };

      const removeScript = async (id) => {
        const scripts = await getAllScripts();
        await saveScripts(scripts.filter(s => s.id !== id));
      };

      switch (args.action) {
        case 'list':
          return await getAllScripts();

        case 'install':
          if (!args.code) throw new Error('code is required');
          return await installScript(args.code);

        case 'update':
          if (!args.id) throw new Error('id is required');
          if (!args.code) throw new Error('code is required');
          return await updateScriptCode(args.id, args.code);

        case 'toggle':
          if (!args.id) throw new Error('id is required');
          if (args.enabled === undefined) throw new Error('enabled is required');
          return await toggleScript(args.id, args.enabled);

        case 'delete':
          if (!args.id) throw new Error('id is required');
          await removeScript(args.id);
          return { success: true, id: args.id };

        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    };
    this.register(definition, handler);
  }
}
export { ManageUserScriptsTool };
