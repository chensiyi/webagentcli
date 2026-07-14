本文档记录方向性目标，请保持简洁（一行简单目标，不过三行说明）

进行中（当前迭代）:
    1. 研究 js 脚本工具情况（持续，会重复）
        跟踪 WebMCP / 浏览器自动化 / userScripts 生态新闻与实践，作为工具开发前置基线
        沉淀：docs/JS_TOOL_STRATEGY.md（2026-07 基线，随研究滚动更新）
    2. 完善工具管理基础功能（与油猴/用户脚本接口维护同批次） ✅ 已落地（2026-07-12）
        共享基座：ToolsManager 升级为实时注册表（变更广播 TOOL.* 事件、原地 update、按 source/category/danger 过滤）
        Tool 模型加 source/category/tags/danger/version 元字段
        ScriptsManager 修复 @run-at 解析与安装校验
        ToolsPage 工具管理主页
        工具启用/禁用状态已持久化（tools_enabled 键）并支持 SW 重启恢复
        会话级工具开关模型已落地（Session.toolEnabled 字段 + session.ts 两层合并，全局为天花板、会话仅能收窄；UI：ToolPanel 三态切换 + ChatPage.toggleSessionTool 乐观更新）
        油猴功能 / 用户脚本接口维护：提供并维护相关接口与能力（Tampermonkey 范式，与工具管理同批次推进）
            油猴对齐设计：元数据 @指令 + GM_* API 覆盖矩阵已出基线 → docs/TAMPERMONKEY_ALIGN.md；本批补 @include/@exclude/@require/@resource/@icon + registerMenuCommand/getResourceText/addElement/download/GM_info 补全；VM 沙箱/鉴权 滞后
        用户脚本自动注册 ✅：@tool 声明 → ScriptsManager 解析 toolMeta → reconcileScriptTools 经 ToolsManager.register（source='script'）自动注册为 AI 工具；handler 在目标页执行脚本并注入 __toolArgs，return 值作为工具结果
    3. 会话切换与脚本管理强化 ✅ 已落地（2026-07-12）
        会话切换重构：currentSessionId 改由 Shell 侧内存变量持有，内核 SessionManager 改为无状态（请求显式带 sessionId）；修复 ShellDataCache 双实例（globalThis 单例锚定 + HistoryPage import 统一别名）
        脚本写操作后「重启内核」确认 toast：新增 kernel.reload RPC（轻量重跑 syncRegisteredScripts+reconcileScriptTools，不冲 sidepanel）；安装/更新/卸载统一提示，「立即重启」→ reload+invalidateTools
        manage_user_scripts 标 danger（高危确认闸门）；只读 list/get 拆为独立 get_user_scripts（免确认）；脚本 @-header/@tool 参数已写入工具说明
    4. 预装脚本体系（当前迭代）
        0. 预装机制  ✅ 已落地（2026-07-13）
        - 源即仓库（运行时远程拉取，最贴合原始 #4.0「从 git 仓库批量下载」设想）：首次启动（及升级）从 GitHub 仓库 `chensiyi/webagentcli` 经 **jsDelivr 镜像**拉取 `sidepanel/userscripts/presets.json` 清单 + 其登记的各 `.user.js`，installOrUpdate 进 ScriptsManager；往 `sidepanel/userscripts/` 丢文件并在 presets.json 登记即发布，无需重包扩展
        - **单一脚本目录**：源脚本与预装源统一为 `sidepanel/userscripts/`（不再单独维护 `presets/`）；`presets.json` 是该目录下的预装白名单——只有列进清单的脚本才随发布预装，目录里其余脚本仅作本地源
        - **版本 tag 绑定**：预装源 base = `https://cdn.jsdelivr.net/gh/chensiyi/webagentcli@v<当前版本>/sidepanel/userscripts`，版本取 `chrome.runtime.getManifest().version`（如 v0.8.0）；发布扩展时给仓库打 `vX.Y.Z` tag，已装扩展即从此 tag 拉取；若要固定分支/ref 改 `preset-installer.js` 的 `presetTag()` 即可
        - 为什么 jsDelivr 而非 raw.githubusercontent：扩展 SW 跨域 fetch 受 CORS 限制，前者回 `access-control-allow-origin: *`，后者多不回会 Failed to fetch
        - 运行时 `background/preset-installer.js`（START 阶段）读取清单→逐个 installOrUpdate，随后由 READY 的 syncRegisteredScripts / reconcileScriptTools 统一接管注入与 @tool 投影
        - 幂等 & 升级：storage 记录 `{ [name|namespace]: version }`；已安装且同版本 → 跳过（保留用户编辑/删除），版本变化 → 原地更新；拉取失败（离线/该 tag 暂无清单）→ 跳过，己装脚本不受影响，不阻断启动
        - 仓库结构：`sidepanel/userscripts/presets.json`（文件名数组）+ `sidepanel/userscripts/*.user.js`；当前预装：`page-pet.user.js`（迷你宠物 UI）、`page_to_markdown.user.js`（`@tool` → page_to_markdown_script）
        1. 标准页面能力脚本（`page_to_markdown`、`capture_screenshot`）  ✅ 已落地（2026-07-13）
        - `page_to_markdown`：内置工具（source=builtin），在 MAIN 世界执行 DOM→Markdown 转换（标题/段落/链接/列表/表格/代码），经 executeInPage 返回文本；另附 `@tool` 脚本版 sidepanel/userscripts/page_to_markdown.user.js（@tool.name page_to_markdown_script）供「用户脚本自动注册」路径验证
        - `capture_screenshot`：内置工具（source=builtin），因截图需 chrome.tabs.captureVisibleTab（用户脚本世界无此 API），走内核实现；结果经 mediaStore 落盘为 mediaId，以 [MediaBlock, TextBlock] 返回，模型可直接「看到」截图
        - 两者均在 background/main.ts START 阶段注册为内置 AI 工具，无需预装机制即可用
        2. 油猴请求拦截与编辑（main world，油猴功能一部分，非 agent 请求编排）
        3. Agent 请求编排（background isolated world）：请求生命周期 hooks（beforeRequest / afterResponse），独立于油猴请求拦截
        4. Main World RPC Bridge：升级brige，为脚本在 main world 调用内核 RPC 提供通道（暴露有限接口如 getPageContent、invokeTool），实现页面内 mini agent；安全约束：仅已安装脚本可用，敏感操作走 danger 确认
以上内容可能存在临时性开发文档，当模块足够庞大，开发完成后，应当整理为标准说明文档，清理临时文档。

待建设:
    结构化页内工具（in-page Playwright MCP 范式）  [P1]
        在 run_user_script（裸执行）之上，新增类型化 in-page 工具原语（act/extract/observe，基于 accessibility tree 而非截图，token 友好）
        由 content script 在页面上下文执行，经 RPC 回灌内核；敏感默认走 USER_SCRIPT 隔离世界
        目标：大模型以结构化参数调用页面能力，成本显著低于"写裸脚本+截图"
    自定义化的工具（用户脚本自动注册）  [P2 ✅已落地]
        为脚本加 @tool 声明（@tool.name/@tool.description/@tool.param.<p>/@tool.enum.<p>/@tool.danger），
        内核 ScriptsManager 解析 toolMeta，reconcileScriptTools 扫描已启用脚本并自动经 ToolsManager.register
        （source='script'）注册为可调工具；handler 在目标页执行脚本并注入 __toolArgs，return 值作为工具结果
        用户脚本通常在 main world 执行（Trusted Types 兼容，走 wrapWithGM + USER_SCRIPT 世界）；与 P1 结构化工具共用同一 ToolRegistry
        完成后大模型可自引入/维护外部工具
    子任务编排
        考虑如何利用消息机制，独立建立非 sidepanel 区的独立 agent
        如何关联和管理
        如何进行消息编排
    请求编排
        在已有能力基础上，加入身份与使命（不允许运行中修改）、记忆与记忆管理（作为 tool 引入）
        记忆管理与上下文自动截断结合
        缓存机制开发

长远计划（价值有，但不是当前优先开发目标）:
    隐私保护与内核隔离
    权限管理
    WebMCP 消费者（未纳入当前计划）
        用户目前不认为其比直接工具调用更高效，待生态/效率验证后再评估
        仅作未来占位，绝不现在排期