/**
 * preset-installer — 预装脚本机制（TARGETS #4.0，远程源）
 *
 * 首次启动（及后续升级）时，从远程仓库 sidepanel/userscripts/ 目录（经 jsDelivr 镜像，
 * 支持 CORS）拉取预装清单 presets.json 与其登记的用户脚本，installOrUpdate 进
 * ScriptsManager；随后由 READY 阶段的 syncRegisteredScripts（注入）与
 * reconcileScriptTools（@tool 投影）统一接管，无需单独处理。
 *
 * 单一脚本目录：源脚本统一放 sidepanel/userscripts/，presets.json 是该目录下的「预装
 * 白名单」——只有列进清单的脚本才随发布预装（目录里其余脚本仅作本地源，不预装）。
 *
 * 源即仓库：往 sidepanel/userscripts/ 丢一个 .user.js、在 presets.json 登记并提交，
 * 发布时打上当前版本 tag 即"发布"，无需重新打包扩展——已安装扩展按自身版本号 fetch
 * 对应 tag 下的预装脚本。
 *
 * 之所以走 jsDelivr 而非 raw.githubusercontent.com：扩展 Service Worker 跨域 fetch
 * 受 CORS 限制，前者回 `access-control-allow-origin: *`，后者多数情况不回，会 Failed to fetch。
 *
 * 版本 tag 规则：取当前扩展版本（chrome.runtime.getManifest().version，如 0.8.0），
 * 按当前扩展版本号拼 tag（如 0.7.5）。发布时仓库需打不带 v 前缀的 `X.Y.Z` 的 tag（如 0.7.5）并含 sidepanel/userscripts/ 目录，
 * 扩展即从此 tag 拉取。若要换分支/固定 ref，改 PRESET_REF 即可。
 *
 * 幂等 & 升级：storage 记录 { [name|namespace]: version }。
 *   - 已安装且版本号与远程一致 → 跳过（不覆盖用户后续编辑 / 删除）。
 *   - 未安装 / 版本变化       → installOrUpdate（已存在则原地更新，否则新建）。
 *   - 拉取失败（离线 / 仓库不可达 / 该 tag 暂无清单）→ 跳过预装，己装脚本不受影响，不阻断启动。
 */
import { StorageKeys } from 'kernel/Keys.js';
import { Log } from 'kernel/services/Log.js';

/** 预装源仓库（GitHub org/repo）。 */
const PRESET_REPO = 'chensiyi/webagentcli';
/** 仓库内预装脚本所在目录（相对仓库根）。与本地源目录统一，不再单独维护 presets/。 */
const PRESET_DIR = 'sidepanel/userscripts';
/** 版本 tag 前缀（与仓库 release tag 命名保持一致，tag 不带 v 前缀，如 0.7.5）。 */
const PRESET_TAG_PREFIX = '';

/** 取当前扩展版本号（运行时来源，随 manifest 自动同步）。非扩展环境回退空串。 */
function getManifestVersion() {
  try {
    return chrome.runtime.getManifest()?.version || '';
  } catch {
    return '';
  }
}

/** 版本 tag：前缀 + 当前版本。 */
function presetTag() {
  return PRESET_TAG_PREFIX + (getManifestVersion() || '0.0.0');
}

/**
 * 预装源基址，默认按「当前版本 tag」解析：
 *   https://cdn.jsdelivr.net/gh/<repo>@<version>/sidepanel/userscripts
 * 仓库未打对应 tag / 该目录无 presets.json 时，fetch 会失败并安全跳过。
 */
export const PRESET_REMOTE_BASE = `https://cdn.jsdelivr.net/gh/${PRESET_REPO}@${presetTag()}/${PRESET_DIR}`;

/** 从 URL 拉文本（wrap fetch，便于各调用点 catch 降级） */
async function fetchText(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return await resp.text();
}

/** 由脚本元数据推导去重 key（namespace + name，namespace 空则仅 name） */
function scriptKey(meta) {
  return (meta.namespace ? meta.namespace + '/' : '') + (meta.name || '未命名脚本');
}

/**
 * 执行预装。
 * @param {import('kernel/services/ScriptsManager.js').ScriptsManager} scriptsManager
 * @param {{ get(key:string):Promise<unknown>, set(key:string,value:unknown):Promise<void> }} storage 内核 IStorageManager
 * @param {string} [remoteBase] 预装源基址（默认按当前版本 tag 解析的 PRESET_REMOTE_BASE）。测试或动态配置时可注入。
 * @returns {Promise<{ installed:number, skipped:number }>}
 */
export async function installPresets(scriptsManager, storage, remoteBase = PRESET_REMOTE_BASE) {
  if (!scriptsManager || !storage) return { installed: 0, skipped: 0 };
  if (!remoteBase) {
    Log.warn('preset-installer', '预装源基址无效，跳过预装。');
    return { installed: 0, skipped: 0 };
  }

  // 1) 读预装清单。清单缺失/损坏（离线、tag 未打、目录为空）→ 跳过预装，不阻断启动。
  let files = [];
  try {
    files = JSON.parse(await fetchText(`${remoteBase}/presets.json`));
  } catch (e) {
    Log.warn('preset-installer', `读取远程预装清单 presets.json 失败，跳过预装（可能离线或该版本 tag 暂无清单）: ${remoteBase}`, e);
    return { installed: 0, skipped: 0 };
  }
  if (!Array.isArray(files) || files.length === 0) return { installed: 0, skipped: 0 };

  // 2) 已应用版本记录（幂等 / 升级判断）
  const record = (await storage.get(StorageKeys.PRESET_INSTALLED)) || {};

  // 预读当前已安装脚本，避免逐个 loadAll
  const scripts = await scriptsManager.loadAll();
  const installedKeys = new Set(
    scripts.map((s) => (s.namespace ? s.namespace + '/' : '') + s.name)
  );

  let applied = 0;
  for (const file of files) {
    try {
      const code = await fetchText(`${remoteBase}/${file}`);
      const meta = scriptsManager.parseMetadata(code);
      const key = scriptKey(meta);
      const ver = meta.version || '0';

      // 已安装且版本一致 → 跳过，保留用户的编辑 / 删除
      if (installedKeys.has(key) && record[key] === ver) continue;

      await scriptsManager.installOrUpdate(code);
      record[key] = ver;
      applied++;
      Log.info('preset-installer', `预装脚本已应用：${file} (${ver})`);
    } catch (e) {
      Log.warn('preset-installer', `预装脚本 ${file} 失败，已跳过`, e);
    }
  }

  if (applied > 0) {
    await storage.set(StorageKeys.PRESET_INSTALLED, record);
    Log.info('preset-installer', `本次预装应用 ${applied} 个脚本（共 ${files.length} 个清单项）`);
  }
  return { installed: applied, skipped: files.length - applied };
}
