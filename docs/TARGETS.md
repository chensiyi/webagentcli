本文档记录方向性目标，请保持简洁（一行简单目标，不过三行说明）

进行中（当前迭代）:
    1. 研究 js 脚本工具情况（持续，会重复）
        跟踪 WebMCP / 浏览器自动化 / userScripts 生态新闻与实践，作为工具开发前置基线
        沉淀：docs/JS_TOOL_STRATEGY.md（2026-07 基线，随研究滚动更新）
    2. 完善工具管理基础功能（与油猴/用户脚本接口维护同批次）
        共享基座（2026-07-11 已落地）：ToolsManager 升级为实时注册表（变更广播 TOOL.* 事件、原地 update、按 source/category/danger 过滤）；Tool 模型加 source/category/tags/danger/version 元字段；ScriptsManager 修复 @run-at 解析与安装校验；新增 ToolsPage 工具管理主页；工具启用/禁用状态已持久化（tools_enabled 键）并支持 SW 重启恢复；会话级工具开关模型已落地（Session.toolEnabled 字段 + session.ts 两层合并，全局为天花板、会话仅能收窄；UI 开关面待做）
        油猴功能 / 用户脚本接口维护：提供并维护相关接口与能力（Tampermonkey 范式，与工具管理同批次推进）
        结构化页内工具层 [P1]：类型化 in-page 工具原语（act/extract/observe，基于 accessibility tree），复用上方 ToolRegistry
        用户脚本自动注册 [P2]：@tool grant 标注 → 内核自动注册（经 ToolsManager.register，source='script'），与 P1 共用同一 ToolRegistry
    3. 预装脚本（非默认提供，第 2 项完善后编写）
        标准页面能力脚本：点击/填表/抽取/观察等通用页内能力封装（落地 P1）
        before-request 编排脚本：请求前注入/改写/拦截编排（落地「请求编排」）
        Navigator/Planner/Validator 能力脚本：多_agent 协作（规划-执行-校验）页内实现（落地「子任务编排」，呼应 Nanobrowser 范式）

待建设:
    多媒体功能支持  [基本完成 @v0.7]
        图片/音频/文件 收发与渲染已实现（P0-P3），可选 ImgBB 资源服务器
        未完：视频/语音输入(P4 延后)；模型能力归一化重构(下版本 TODO)
    结构化页内工具（in-page Playwright MCP 范式）  [P1]
        在 run_user_script（裸执行）之上，新增类型化 in-page 工具原语（act/extract/observe，基于 accessibility tree 而非截图，token 友好）
        由 content script 在页面上下文执行，经 RPC 回灌内核；敏感默认走 USER_SCRIPT 隔离世界
        目标：大模型以结构化参数调用页面能力，成本显著低于"写裸脚本+截图"
    自定义化的工具（用户脚本自动注册）  [P2]
        为脚本加特殊 grant 记录（@tool + 参数 schema），内核扫描并自动注册为可调工具
        用户脚本通常在 main world 执行（Trusted Types 兼容）；与 P1 结构化工具共用同一 ToolRegistry
        完成后大模型可自引入/维护外部工具
    子任务编排
        考虑如何利用消息机制，独立建立非sidepanel区的独立agent
        如何关联和管理
        如何进行消息编排
    请求编排
        在已有能力基础上，加入身份与使命（不允许运行中修改）、记忆与记忆管理（作为tool引入）
        记忆管理与上下文自动截断结合
        缓存机制开发

长远计划（价值有，但不是当前优先开发目标）：
    隐私保护与内核隔离
    权限管理
    WebMCP 消费者（未纳入当前计划）
        用户目前不认为其比直接工具调用更高效，待生态/效率验证后再评估
        仅作未来占位，绝不现在排期