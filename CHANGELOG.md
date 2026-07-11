# 版本日志 (Changelog)

本文件为版本发布痕迹。详细开发计划统一维护在 `docs/TARGETS.md`。

## v0.7.0 — 2026-07-11

**多媒体图片识别可用化 + 缓存/反馈体系完善**

### 功能
- 资源服务器支持 **ImgBB** 图床标准上传（`key` + `image` → 响应 `data.url`），设置页新增图床类型下拉与 API Key 输入；通用模式（自建服务器）保留。
- 模型能力识别：OpenRouter / LMStudio `listModels` 补齐 `input_modalities` / `supports_vision|audio|video`；`ModelInfo` 收敛为单一权威字段 `input_modalities`。
- 新增端到端集成测试 `media-flow.integration.test.ts`（上传→存储→resolver→序列化为 OpenAI `image_url`/`input_audio`），Shell→Kernel 全链路 Node 自动验证。

### 架构
- 缓存层新增**观察者机制**：`ShellDataCache.subscribe(scope, cb)`；`saveSettings`（写穿透广播）/ `patchSettings`（差量合并）均通知订阅者。ChatPage 改为订阅**单例缓存自身**的 `settings` 变更来刷新模型能力（不再直连 SettingsPage IPC），复用 `cleanups` 统一退订。

### 文档
- 删除 `docs/MULTIMEDIA_MESSAGE_PLAN.md`（详细方案已实施完毕，实施进度/待办已并入 `docs/TARGETS.md` 的「多媒体功能支持」条目，作为后续维护入口）。

### 修复 / 收尾
- **反馈完善**：补齐此前静默吞掉的保存/操作结果提示——设置页主题切换成功 toast；历史页切换/删除会话失败 toast + 删除成功 toast；对话页删除消息/切换工具/新建对话/改标题/改思考强度/停止生成 等失败均弹错误 toast（此前仅 Log.error 无用户可见提示）。
- **模型能力归一化重构（已完成）**：`BaseProviderAPIService.normalizeModel` + 可覆写 extractor（`extractInputModalities` / `extractSupportsReasoning` / `extractSupportsTools` / `extractModality` / `extractPricing`）；`OpenRouterService` 覆写 3 个字段布局差异的 extractor（`architecture.input_modalities`、`supported_parameters.includes`、`architecture.modality`），`LMStudioService` 复用基类默认；**废弃原「抽独立 `modelCapabilities.ts` + source 分发 util」方案**（该用覆写消解的反模式）。
- **XSS P0 修复**：`renderMarkdown` 接入 `DOMPurify` 净化（新增依赖 `dompurify`），阻断 LLM 输出经 `{@html}` 注入 `<script>` / 事件处理器；`MessageBubble` 与 `ToolMessageCard` 均经此函数，一处修复全覆盖。
- P3 真机发图验证**已完成**（用户以 ImgBB key 实测通过，0.7 才升版）；P4 视频/语音输入延后。
