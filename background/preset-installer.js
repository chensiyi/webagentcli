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
 * 版本 tag 规则：正式发布取当前扩展版本（chrome.runtime.getManifest().version，如 0.7.8），
 * 按版本号拼 tag（如 0.7.8）。发布时仓库需打不带 v 前缀的 `X.Y.Z` 的 tag（如 0.7.8）并含 sidepanel/userscripts/ 目录，
 * 扩展即从此 tag 拉取。dev 分支构建则改从 `dev` 分支拉取（见下方 presetRef），无需打 tag。
 *
 * 来源 / 名称判定（dev 强制安装基础）：
 *   - 已装脚本 namespace+name 与预装项完全一致 → installOrUpdate 覆盖更新（update 方法，
 *     保留 id 与 @tool 投影），无需额外「强制」标志，天然安全；dev 强制安装即走此路径。
 *   - 完全无同名脚本 → 首次安装。
 *   - 同名但 namespace 不同（第三方 / 用户脚本）→ 跳过，避免误覆盖。
 *   - 拉取失败（离线 / 仓库不可达 / 该 tag 暂无清单）→ 跳过预装，己装脚本不受影响，不阻断启动。
 */
import { StorageKeys } from 'kernel/Keys.js';
import { Log } from 'kernel/services/Log.js';

/** 预装源仓库（GitHub org/repo）。 */
const PRESET_REPO = 'chensiyi/webagentcli';
/** 仓库内预装脚本所在目录（相对仓库根）。与本地源目录统一，不再单独维护 presets/。 */
const PRESET_DIR = 'sidepanel/userscripts';
/** 取当前扩展版本号（运行时来源，随 manifest 自动同步）。非扩展环境回退空串。 */
function getManifestVersion() {
  try {
    return chrome.runtime.getManifest()?.version || '';
  } catch {
    return '';
  }
}

/**
 * 预装源 ref（决定从哪拉预装脚本）：
 * - dev 分支构建（IS_DEV 为真，由 vite 按 git 分支注入 __DEV__）：永远从 `dev` 分支拉取，
 *   不依赖版本 tag —— 这正是「dev 分支不支持发版」的根因修复：dev 构建不再因 @<version>
 *   tag 不存在（dev 是变动分支、无对应 tag）而 404，无需为每次 dev 构建打 tag。
 * - 正式发布（IS_DEV 为假）：按当前扩展版本号拼 tag（如 0.7.8），需仓库打对应 X.Y.Z tag（不带 v 前缀）。
 * 复用 kernel/globals.d.ts 注入的 __DEV__（与 kernel/index.ts 的 IS_DEV 同源），无需新增配置。
 */
function presetRef() {
  if (__DEV__) return 'dev';
  return getManifestVersion() || '0.0.0';
}

/**
 * 预装源基址，按「当前版本 tag 或 dev 分支」解析：
 *   https://cdn.jsdelivr.net/gh/<repo>@<ref>/sidepanel/userscripts
 * <ref> 为版本 tag（正式发布）或 `dev` 分支（dev 构建）。仓库未打对应 tag / 该目录无
 * presets.json 时，fetch 会失败并安全跳过。
 */
export const PRESET_REMOTE_BASE = `https://cdn.jsdelivr.net/gh/${PRESET_REPO}@${presetRef()}/${PRESET_DIR}`;

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
 * @returns {Promise<{ installed:number, skipped:number, reachable:boolean }>}
 *   reachable：远程清单 presets.json 是否成功拉取并解析（用于调用方判定「是否可安全落地版本标记」，
 *   离线/仓库不可达时为 false，调用方应保留旧版本标记以便下次 boot 重试）。
 */
export async function installPresets(scriptsManager, storage, remoteBase = PRESET_REMOTE_BASE) {
  if (!scriptsManager || !storage) return { installed: 0, skipped: 0, reachable: false };
  if (!remoteBase) {
    Log.warn('preset-installer', '预装源基址无效，跳过预装。');
    return { installed: 0, skipped: 0, reachable: false };
  }

  // 1) 读预装清单。清单缺失/损坏（离线、tag 未打、目录为空）→ 跳过预装，不阻断启动。
  let files = [];
  try {
    files = JSON.parse(await fetchText(`${remoteBase}/presets.json`));
  } catch (e) {
    Log.warn('preset-installer', `读取远程预装清单 presets.json 失败，跳过预装（可能离线或该版本 tag 暂无清单）: ${remoteBase}`, e);
    return { installed: 0, skipped: 0, reachable: false };
  }
  // 清单已拉到（reachable=true），即便为空也算「远程可达」——避免调用方误判为离线而反复重试。
  if (!Array.isArray(files) || files.length === 0) return { installed: 0, skipped: 0, reachable: true };

  // 2) 已应用版本记录（仅作遥测 / 安装清单，不再用于跳过判定）
  const record = (await storage.get(StorageKeys.PRESET_INSTALLED)) || {};

  // 预读当前已安装脚本，供来源(namespace)+名称(name) 一致性判定
  const scripts = await scriptsManager.loadAll();

  let applied = 0;
  for (const file of files) {
    try {
      const code = await fetchText(`${remoteBase}/${file}`);
      const meta = scriptsManager.parseMetadata(code);
      const key = scriptKey(meta);
      const ver = meta.version || '0';

      // 来源+名称检测：
      //  - 已装脚本 namespace+name 与预装项完全一致 → 视作本扩展自带预装，
      //    直接 installOrUpdate 覆盖更新（update 方法，保留 id 与 @tool 投影），
      //    无需额外「强制」标志，天然安全（dev 强制安装即走此路径）；
      //  - 完全无同名脚本 → 首次安装；
      //  - 同名但 namespace 不同（第三方 / 用户脚本）→ 跳过，避免误覆盖。
      const sameSourceName = scripts.find(
        (s) => (s.namespace || '') === (meta.namespace || '') && (s.name || '') === (meta.name || '')
      );
      if (sameSourceName) {
        await scriptsManager.installOrUpdate(code);
        record[key] = ver;
        applied++;
        Log.info('preset-installer', `预装脚本已更新（覆盖）：${file} (${ver})`);
      } else {
        const sameNameOtherSource = scripts.find((s) => (s.name || '') === (meta.name || ''));
        if (sameNameOtherSource) {
          Log.warn('preset-installer', `跳过 ${file}：存在同名但来源(namespace)不同的脚本，避免误覆盖`);
        } else {
          await scriptsManager.installOrUpdate(code);
          record[key] = ver;
          applied++;
          Log.info('preset-installer', `预装脚本已安装：${file} (${ver})`);
        }
      }
    } catch (e) {
      Log.warn('preset-installer', `预装脚本 ${file} 失败，已跳过`, e);
    }
  }

  if (applied > 0) {
    await storage.set(StorageKeys.PRESET_INSTALLED, record);
    Log.info('preset-installer', `本次预装应用 ${applied} 个脚本（共 ${files.length} 个清单项）`);
  }
  return { installed: applied, skipped: files.length - applied, reachable: true };
}
