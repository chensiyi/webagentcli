本文档记录方向性目标，请保持简洁（一行简单目标，不过三行说明）

进行中（当前迭代）:
    1. 研究 js 脚本工具情况（持续，会重复）
        跟踪 WebMCP / 浏览器自动化 / userScripts 生态新闻与实践，作为工具开发前置基线
        沉淀：docs/JS_TOOL_STRATEGY.md（2026-07 基线，随研究滚动更新）
    2. 完善工具管理基础功能（与油猴/用户脚本接口维护同批次） ✅ 已落地（2026-07-12）
        - ToolsManager 升级为实时注册表（TOOL.* 事件、原地 update、按 source/category/danger 过滤）；Tool 模型加 source/category/tags/danger/version 元字段
        - 用户脚本自动注册 ✅：@tool 声明 → ScriptsManager 解析 toolMeta → reconcileScriptTools 经 ToolsManager.register（source='script'）注册为 AI 工具；油猴 GM_* 对齐基线见 docs/TAMPERMONKEY_ALIGN.md
        - 工具启用/禁用持久化（tools_enabled）+ 会话级工具开关（Session.toolEnabled 两层合并，UI 三态切换）；ToolsPage 工具管理主页
    3. 会话切换与脚本管理强化 ✅ 已落地（2026-07-12）
        - currentSessionId 改由 Shell 内存持有，SessionManager 无状态化；ShellDataCache 双实例修复（globalThis 单例）
        - 脚本写操作后「重启内核」确认 toast：kernel.reload RPC（syncRegisteredScripts+reconcileScriptTools）；manage_user_scripts 标 danger，只读拆为 get_user_scripts
    4. PRESET_SCRIPTS（当前迭代）
        0. 预装机制  ✅ 已落地（2026-07-14）
        - 详见架构文档「PRESET_SCRIPTS」一节：单一脚本目录 sidepanel/userscripts/，presets.json 白名单 + 按版本 tag 经 jsDelivr 远程拉取，幂等升级
        1. 标准页面能力脚本  ✅ 已落地（2026-07-14）
        - capture_screenshot：已**脚本化**（不再内置，source=script）。预装脚本 sidepanel/userscripts/screenshot.user.js（@tool 名 capture_screenshot），经 @tool 机制自动注册。流程：GM_captureVisibleTab（background 桥接调用 SW 专属 chrome.tabs.captureVisibleTab）截图 → 脚本自带上传拿网络 URL → GM_insertComposerMedia 推给 shell → shell 复用粘贴管线把 URL 录入输入框（仅插入、用户手动发送）。内核无截图专属逻辑（userMedia 注入 / mediaStore 截图接线均已删除）；setMediaResolver 仍保留服务粘贴/拖拽上传路径。
        - page_to_markdown：预装脚本（source=script），非内置工具；经 sidepanel/userscripts/page_to_markdown.user.js 的 @tool 声明 + 预装/脚本机制自动注册为 page_to_markdown_script，在 MAIN 世界执行 DOM→Markdown 转换；不随 capture_screenshot 默认可用，需经预装或手动安装
        2. 油猴请求拦截与编辑（main world，油猴功能一部分，非 agent 请求编排）  待开发 · 进行中 · 优先
        - 拦截/编辑页面请求，扩展 agent 的页面能力
        - 设计：`docs/4.2-request-intercept-design.md`（2026-07-17）。决议：① 拦截器注入 **MAIN world**（USER_SCRIPT 世界看不见页面 fetch/XHR）；② **规则随脚本注册、随脚本初始化加载、随脚本生灭**，不进 SettingsManager/GM_setValue；③ **响应编辑本期不做**（响应侧默认交给 AI）；④ 阻塞式（决策返回前不放请求，XHR 延迟 send，超时 fail-open）；⑤ 默认关闭，需显式 `@grant GM_webRequest`。
        3. Agent 请求编排（background isolated world）  待开发 · 进行中 · 其次
        - 请求生命周期 hooks（beforeRequest / afterResponse），独立于油猴请求拦截
        4. Main World RPC Bridge  ✅ 已落地（含微调：阻塞式请求，2026-07-17 确认）
        - 实现：`bridge/UserScriptBridge.ts` 把 main world 脚本经 `chrome.runtime.onUserScriptConnect` 的 Port 接入 `rpcServer.dispatch()`，可调用全部 facade（session/tools/settings/storage/scripts/media/kernel），STREAM_*/MESSAGE_ADDED/SESSION.CONFIRM_* 已按 boundSessionId 转发 → 页面内 mini agent 通道打通；`pet-chat.js` 的 `rpcCall` 即典型客户端。
        - 微调项（进行中）：将请求改为阻塞式（dispatch 返回前 await 内核处理完，调用方同步等待结果）；仅已安装脚本可用，敏感操作走 danger 确认。
以上内容可能存在临时性开发文档，当模块足够庞大，开发完成后，应当整理为标准说明文档，清理临时文档。

待建设:
    Provider 多会话并行隔离（按 program/Process 收口）  已知缺口
        现状：ProviderFactory 单例 + Service 单 abortController，chatStream 覆盖式；多会话并行流式时
        cancel 只能中止最后一个，applySessionCache 共享实例存在竞态。
        方向：每轮流式挂 ProcessManager 的 Process，terminateFn 持本轮 AbortController，chatStream 收外部
        signal；cancel 按 sessionId/processId 精确中止，provider 缓存按 session 键隔离。
    子任务编排
        考虑如何利用消息机制，独立建立非 sidepanel 区的独立 agent
        如何关联和管理
        如何进行消息编排
    注：结构化页内工具（in-page Playwright MCP）、请求编排、自定义化工具（@tool 自动注册）已分别并入「进行中 / PRESET_SCRIPTS」跟踪或已落地，不重复规划

长远计划（价值有，但不是当前优先开发目标）:
    隐私保护与内核隔离
    权限管理
    WebMCP 消费者（未纳入当前计划）
        用户目前不认为其比直接工具调用更高效，待生态/效率验证后再评估
        仅作未来占位，绝不现在排期