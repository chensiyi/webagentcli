/**
 * ManageUserScriptsTool - 用户脚本管理工具
 * 允许 AI 查看、安装、编辑、启用、禁用和删除用户脚本
 */
class ManageUserScriptsTool extends window.IToolService {
  constructor() {
    super();
    const definition = new window.ToolDefinition({
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
      // 确保 ScriptsModel 可用
      if (!window.ScriptsModel) {
        // 创建临时 ScriptsModel（需要 chrome.storage）
        window.ScriptsModel = new (function() {
          const storageKey = 'user_scripts';
          this.getAll = () => new Promise((resolve, reject) => {
            chrome.storage.local.get([storageKey], (result) => {
              if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
              resolve(result[storageKey] || []);
            });
          });
          this.save = (scripts) => new Promise((resolve, reject) => {
            chrome.storage.local.set({ [storageKey]: scripts }, () => {
              if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
              resolve();
            });
          });
          this.parseMetadata = (code) => {
            const metadata = { name: '', namespace: '', version: '', description: '', author: '', match: [], grant: [] };
            const match = code.match(/==UserScript==([\s\S]*?)==\/UserScript==/);
            if (!match) throw new Error('无效的 UserScript 格式');
            const block = match[1];
            const nameMatch = block.match(/@name\s+(.+)/);
            if (nameMatch) metadata.name = nameMatch[1].trim();
            const nsMatch = block.match(/@namespace\s+(.+)/);
            if (nsMatch) metadata.namespace = nsMatch[1].trim();
            const vMatch = block.match(/@version\s+(.+)/);
            if (vMatch) metadata.version = vMatch[1].trim();
            const dMatch = block.match(/@description\s+(.+)/);
            if (dMatch) metadata.description = dMatch[1].trim();
            const aMatch = block.match(/@author\s+(.+)/);
            if (aMatch) metadata.author = aMatch[1].trim();
            const matchRegex = /@match\s+(.+)/g;
            let m; while ((m = matchRegex.exec(block)) !== null) metadata.match.push(m[1].trim());
            const grantRegex = /@grant\s+(.+)/g;
            let g; while ((g = grantRegex.exec(block)) !== null) metadata.grant.push(g[1].trim());
            if (!metadata.name) metadata.name = '未命名脚本';
            return metadata;
          };
          this.generateId = () => `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          this.install = async (code) => {
            const metadata = this.parseMetadata(code);
            const id = this.generateId();
            const script = { id, name: metadata.name, namespace: metadata.namespace, version: metadata.version, description: metadata.description, author: metadata.author, match: metadata.match, grant: metadata.grant, enabled: true, code, createdAt: Date.now(), updatedAt: Date.now() };
            const scripts = await this.getAll();
            scripts.push(script);
            await this.save(scripts);
            return script;
          };
          this.updateCode = async (id, code) => {
            const scripts = await this.getAll();
            const index = scripts.findIndex(s => s.id === id);
            if (index === -1) throw new Error('脚本不存在');
            const metadata = this.parseMetadata(code);
            scripts[index] = { ...scripts[index], name: metadata.name, namespace: metadata.namespace, version: metadata.version, description: metadata.description, author: metadata.author, match: metadata.match, grant: metadata.grant, code, updatedAt: Date.now() };
            await this.save(scripts);
            return scripts[index];
          };
          this.toggle = async (id, enabled) => {
            const scripts = await this.getAll();
            const index = scripts.findIndex(s => s.id === id);
            if (index === -1) throw new Error('脚本不存在');
            scripts[index].enabled = enabled;
            scripts[index].updatedAt = Date.now();
            await this.save(scripts);
            return scripts[index];
          };
          this.remove = async (id) => {
            const scripts = await this.getAll();
            await this.save(scripts.filter(s => s.id !== id));
          };
        })();
      }

      switch (args.action) {
        case 'list':
          return await window.ScriptsModel.getAll();
        
        case 'install':
          if (!args.code) throw new Error('code is required');
          return await window.ScriptsModel.install(args.code);
        
        case 'update':
          if (!args.id) throw new Error('id is required');
          if (!args.code) throw new Error('code is required');
          return await window.ScriptsModel.updateCode(args.id, args.code);
        
        case 'toggle':
          if (!args.id) throw new Error('id is required');
          if (args.enabled === undefined) throw new Error('enabled is required');
          return await window.ScriptsModel.toggle(args.id, args.enabled);
        
        case 'delete':
          if (!args.id) throw new Error('id is required');
          await window.ScriptsModel.remove(args.id);
          return { success: true, id: args.id };
        
        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    };
    this.register(definition, handler);
  }
}
if (typeof window !== 'undefined') window.ManageUserScriptsTool = ManageUserScriptsTool;
