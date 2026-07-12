# JS 工具发展方向（Agent 脚本工具调研 · 2026-07-11）

> 本文件是 P1 + P2「工具部分开发」的前置基线。梳理当前 agent JS 脚本工具的新闻与实践，明确 JS 工具的发展方向，并落到本项目的 P1/P2 落地点。
> 调研日期：2026-07-11（当日已用 WebSearch 复核 WebMCP / 浏览器自动化 / Chrome userScripts 三项现状）。

---

## 1. 总览：JS 工具在 Agent 栈里处于什么位置

成本层级（dev.to/amitrix 归纳，差距是**架构性**而非模型性）：

```
Native API  >  Connector / MCP  >  Browser automation  >  Computer use (vision)  >  Human
  最便宜/最快      次优              脚本工具所在的中间层            最贵/最慢            不可替代
```

- Native API 与 computer use 之间约 **45× 成本 / 51× 速度**差；实现方式差异可造成最高 **~180× 成本跨度**。
- 推论：**能 native API 就别走 browser automation；能 browser automation 就别走 computer vision**。脚本工具（页内执行 / 浏览器自动化）是 cost-effective 的中间层，但不该拿去硬刚「截图 + 视觉」的 computer use 路线——那是更贵更慢的退路，不是主线。

---

## 2. 三波演进：JS 工具从「裸执行」到「结构化接口 + 页内 Agent + WebMCP」

```
波次 1  裸执行 / 用户脚本（Tampermonkey 式）
        │  用户写任意 JS，注入页面执行。能力上限高、但大模型每次都要「写原始代码 + 看截图」，
        │   token 贵、易碎、不可复用。  ← 本项目 run_user_script 所在层（逃生舱 / 高级入口）
        ▼
波次 2  结构化 + 类型化 in-page 工具层（in-page Playwright MCP 范式）
        │  把页面能力抽象成 typed 工具原语（act / extract / observe），大模型传结构化参数即可，
        │   基于 accessibility tree 而非截图 → token 友好、确定性强、可组合。  ← P1 目标层
        ▼
波次 3  WebMCP —— 站点自暴露工具给页内 Agent
           网站自己 `navigator.modelContext.registerTool(...)`，Agent 直接拿到用户「已登录会话」。
           2026 头条级变化，但现实采用≈0，先占位消费者。  ← P2 消费者目标
```

---

## 3. 当前实践（2026-07 核实）

### 3.1 浏览器自动化三强对比

| 维度 | Browser Use | Stagehand | Playwright MCP |
|---|---|---|---|
| 定位 | Python 自主 Agent 循环（observe→plan→act→verify） | TS SDK（act/extract/observe 三原语，开发者写控制流） | 微软官方，把 Playwright 暴露为 MCP 工具（纯工具层，无 Agent 逻辑） |
| 页面理解 | 视觉 + DOM | 视觉 + DOM 混合 | accessibility tree（snapshot 模式）/ 截图 |
| 自主权 | 高（Agent 自己决定下一步） | 低（开发者写流程） | 无（工具而已，Agent 决定怎么用） |
| 成本 | 最高（每步都推理，重复任务贵 25–30×） | 较低（auto-cache：同「形状」页面只付一次 LLM 费） | 中等（snapshot 模式 token 省；微软官方维护） |
| Stars | ~65k | ~15k | ~70k（Playwright 主仓） |
| 最适合 | 开放式研究 / 一次性任务 | 生产抓取（DOM 漂移）/ 表单填充 | 给已有 Agent 框架接浏览器能力（Claude Code / Cline） |

**关键模式（2026 走向）**：三者边界正在消融——Playwright MCP 可装进 Claude Code 帮修 E2E 测试；Stagehand / Browser Use 也都出了 MCP 变体。**同一 Agent 内可混用**：确定性步骤用 Playwright MCP，缓存 AI 步骤用 Stagehand，开放任务用 Browser Use。本项目的「结构化页内工具层（P1）」本质上就是 Playwright MCP 范式在扩展内的私有实现。

### 3.2 Chrome userScripts API（我们的基座，已核实正确）

- 要求：`userScripts` 权限 + `host_permissions`；`minimum_chrome_version: 120`；MV3。用户须在扩展详情页开启「允许用户脚本」开关（`chrome.userScripts` 否则未定义）。
- 可用性检测标准范式：`try { chrome.userScripts.getScripts(); return true } catch { return false }`。
- **世界（World）选择**：
  - `USER_SCRIPT`（默认，隔离世界）：宿主页面/其他扩展不可访问；**无扩展 API**；可用 `userScripts.configureWorld({ csp })` 配 CSP。适合放敏感逻辑。
  - `MAIN`（页面 JS 上下文）：与页面共享、对页面可见。**Trusted Types 兼容**——内部 V8 编译注入不触发 TT 拦截 `new Function`/`eval`。适合需要读写页面 JS 状态的场景（TARGETS 已记「用户脚本通常在 main world」）。
- **消息**：低信任上下文专用通道 `runtime.onUserScriptMessage` / `onUserScriptConnect`；用 `userScripts.configureWorld({ messaging: true })` 开启。
- **行业验证**：uBlock Origin Lite **v2026.419.1519** 已用 offscreen 文档编译 `+js()` 脚本，经 `browser.userScripts.register({ world: 'MAIN' / 'USER_SCRIPT' })` 注入——主流扩展正在采用此路径，**我们的基座选择被印证**。

### 3.3 页内 Agent 架构（side-panel agent 范式，已被印证）

- **Nanobrowser**：多 Agent（Navigator / Planner / Validator）在 side panel 内编排。
- **AgentBoard**：tab 级 sidebar，组合 WebMCP + Remote MCP + ToolRegistry。
- **PageAgent**：「agent lives in the webpage」——一行标签把 Agent 嵌入页面。
- 三者共同印证本项目的 **Service Worker + content script + side panel** 架构方向正确。

### 3.4 WebMCP 现状（2026-07）

- 形态：W3C 草案（Web Machine Learning 组）。Chrome **149 origin trial**；本地开发走 flag `chrome://flags/#enable-webmcp-testing`。
- 两套 API：
  - **Imperative**：`navigator.modelContext.registerTool({ name, description, inputSchema, execute })`，返回 `{ content: [{ type: "text", text }] }`。
  - **Declarative**：给标准 `<form>` 加 `toolname` / `tooldescription` 注解，浏览器自动生成 input schema（Angular 已有实验支持）。
- **门控**：① origin isolation（文档须 origin-isolated，`document.domain` 启用则禁用）；② Permissions Policy `tools`（默认 `self`，跨源 iframe 需 `allow="tools"`）。
- **生态**：已有 polyfill（`@mcp-b/global` 等）与 Lighthouse 13.3「Agentic Browsing」审计项（信息性，不失败）。
- **现实**：采用≈0，多数 Agent 仍读裸 DOM；属「插旗」动作。安全模型未完善——**绝不可无用户确认暴露破坏性 / 改账户动作**（只读审计、计算器、搜索是安全首选）。

---

## 4. 安全模型（贯穿 P1 / P2）

- **浏览器沙箱作为最后安全闸**：`iframe.contentWindow` / `WorkerGlobalScope` 隔离，独立 localStorage。
- **按站点策略门控（per-site policy gate）**：Observe（仅观察）→ Assist（一键协助）→ Autopilot（限时同意）。
- **用户脚本 MAIN 世界可被页面读取/干扰（无隔离）** → 仅当可接受页面窥探时用；敏感逻辑走 `USER_SCRIPT` 隔离世界或受限 grant。
- **破坏性动作必须人工确认**（WebMCP 与用户脚本通用铁律）。

---

## 5. 落到本项目：P1 / P2 工具开发基线

### P1 —— 结构化页内工具层（in-page Playwright MCP 范式）

- **目标**：在 `run_user_script`（裸执行）之上，增加**类型化 in-page 工具**，让大模型以结构化参数调用页面能力（点击 / 填表 / 抽取 / 观察），而非每次写原始 JS + 看截图。
- **具体落地**：
  1. 内核新增一组「页内工具」原语（act / extract / observe 风格，**基于 accessibility tree 而非截图**，token 友好）。
  2. 这些工具由 content script 在页面上下文执行，经 RPC / 消息回灌内核（复用现有 `bridge/RPC.ts` 通道）。
  3. 页面上下文执行复用 `userScripts` MAIN 世界（Trusted Types 兼容）；敏感默认走 `USER_SCRIPT` 隔离世界。
  4. 与 `run_user_script` **共存**：原始脚本 = 逃生舱 / 高级入口；结构化工具 = 主路径（确定性步骤）。
- **验收**：大模型能「以工具调用方式」完成确定性页面操作，token 成本显著低于「写裸脚本 + 截图」。

### P2 —— WebMCP 消费者 + 用户脚本自动注册

- **WebMCP 消费者**：特性检测 `navigator.modelContext`，发现页内已注册工具 → 作为 MCP 工具暴露给大模型；无则**静默降级**（不报错）。成本极低，先占位。
- **用户脚本自动注册**（呼应 TARGETS「自定义化的工具」）：为脚本加特殊 grant 标注（`@tool` + 参数 schema），内核扫描并**自动注册为可调工具**；MAIN 世界执行（TARGETS 已记「用户脚本通常在 main world」）。
- **共用 ToolRegistry**：P1 的结构化工具层与 P2 的自动注册脚本，落到**同一个工具注册表**，避免两套机制。
- **验收**：① 访问支持 WebMCP 的站点时，Agent 能自动发现并调用其工具；② 用户写的标注脚本无需手动接线即成为可用工具。

---

## 6. 不在范围内（先不做）

- **Computer use / 视觉路线**：成本高、速度慢，非脚本工具主线。
- **自建 WebMCP 服务端**：我们是消费者不是站点方；除非要做 demo 站点。
- **视频 / 语音输入**：TARGETS 已标 P4，延后。

---

## 7. 一句话结论

JS 工具正从「裸执行用户脚本」演进到「类型化页内工具 + 页内 Agent + WebMCP 自暴露」；本项目基座（userScripts API）选得对，**P1 补结构化工具层（in-page Playwright MCP 范式），P2 做 WebMCP 消费者 + 用户脚本自动注册**，三者共享一个 ToolRegistry。
