<script lang="ts">
import { getContext, onMount, onDestroy } from 'svelte';
import { waitKernelReady } from '../utils/kernel-ready.js';
import { KernelChannels } from 'kernel/Events.js';
  import Button from 'sidepanel/components/atoms/Button.svelte';
  import Input from 'sidepanel/components/forms/Input.svelte';
  import Select from 'sidepanel/components/forms/Select.svelte';
  import Switch from 'sidepanel/components/forms/Switch.svelte';
  import Slider from 'sidepanel/components/forms/Slider.svelte';
  import Badge from 'sidepanel/components/atoms/Badge.svelte';
  import Card from 'sidepanel/components/layout/Card.svelte';
  import { useToast } from 'sidepanel/components/overlays/toast-store.svelte';
  import { Log } from 'kernel/services/Log.js';
  import { getShellCache } from 'sidepanel/utils/shell-cache.js';

  const ipc: any = getContext('ipc');
  const settingsChannel = ipc?.getOrCreateChannel?.(KernelChannels.SETTINGS) || ipc;
  const api: any = getContext('api');
  const cache = getShellCache(api);
  const toast = useToast();

  // ---------- Reactive State ----------
  let currentSettings = $state<Record<string, any>>({});
  let isLoadingModels = $state(false);
  let modelSearchValue = $state('');
  let showModelDropdown = $state(false);
  let showApiKey = $state(false);
  let isSaving = $state(false);
  let isLoaded = $state(false);

  // ---------- Computed ----------
  const apiStandard = $derived(currentSettings.apiStandard || 'openrouter');
  const requiresApiKey = $derived(apiStandard !== 'lm-studio');
  // 模型列表：统一从 currentSettings.models 派生，存进去就一直有效，不需要单独缓存
  const modelsList = $derived((Array.isArray(currentSettings.models) ? currentSettings.models : []) as ModelInfo[]);
  const hasModels = $derived(modelsList.length > 0);

  const apiStandardOptions = [
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'lm-studio', label: 'LM Studio' },
  ];

  const reasoningEffortOptions = [
    { value: 'off', label: '关闭' },
    { value: 'low', label: '低 (快速)' },
    { value: 'medium', label: '中 (平衡)' },
    { value: 'high', label: '高 (深入)' },
  ];

  const providerDefaults: Record<string, { endpoint: string; model: string }> = {
    openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4' },
    openrouter: { endpoint: 'https://openrouter.ai/api/v1', model: '' },
    'lm-studio': { endpoint: 'http://localhost:1234', model: '' },
  };

  // ---------- Model Types ----------
  interface ModelInfo {
    id: string;
    name?: string;
    contextLength?: number;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
    /**
     * 预留设计（reserved design）：模型输入模态的单一权威字段（如 ['text','image','audio','video']）。
     * 各 Provider（OpenRouter / LMStudio）与 handleLoadModels 统一写入此字段；supports_vision/audio/video 由其派生。
     * 更完整的「模型能力归一化」（跨 Provider 共享 util、统一序列化 / 请求）列为下个版本 TODO，本版本不做进一步开发。
     * 注：inputModalities / modalities 旧别名已移除，统一以 input_modalities 为准。
     */
    input_modalities?: string[];
    description?: string;
    supports_reasoning?: boolean;
    supports_tools?: boolean;
    supports_function_calling?: boolean;
    supports_json_mode?: boolean;
    /** 由 input_modalities 派生的能力标志 */
    supports_vision?: boolean;
    supports_audio?: boolean;
    supports_video?: boolean;
    links?: { details?: string };
    capabilities?: Record<string, boolean>;
    metadata?: { description?: string };
  }

  /**
   * 从不同 Provider 的模型结构里归一化出输入模态数组。
   * 覆盖：OpenRouter(architecture.input_modalities)、OpenAI 兼容(input_modalities/modalities)、
   * 以及 modality 字符串(如 "text+image->text")两种写法。
   */
  function normalizeModalities(m: any): string[] {
    const arch = m?.architecture || {};
    const raw = arch.input_modalities || m?.input_modalities || m?.modalities || [];
    if (Array.isArray(raw) && raw.length) {
      return raw.map((x: any) => String(x).toLowerCase());
    }
    // 兜底：解析 modality 字符串，如 "text+image->text"
    const mod: string = arch.modality || m?.modality || '';
    if (typeof mod === 'string' && mod.includes('->')) {
      return mod
        .split('->')[0]
        .split('+')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }
    return [];
  }

  // ---------- Init: Load Settings via RPC ----------

  onMount(() => {
    // 内核就绪后再加载（等待 bootComplete 消息，时序门控）
    waitKernelReady(ipc).then(() => {
      loadSettings(true).finally(() => { isLoaded = true; }); // 页面（重）加载：强制全量获取并刷新缓存
    });
  });

  onDestroy(() => {
  });

  async function loadSettings(force = false) {
    try {
      // 页面（重）加载入口传 force=true：全量获取并把结果写回缓存
      const raw = await cache.getSettings(force);
      currentSettings = { ...(raw || {}) };
      currentSettings.resourceServer = currentSettings.resourceServer || {};
      applyTheme(currentSettings.theme);
      Log.info('SettingsPage', 'Settings loaded via API contract');
    } catch (e) {
      Log.error('SettingsPage', 'Failed to load settings', e);
    }
  }

  // ---------- Handlers ----------
  function applyTheme(theme: string | undefined) {
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  function handleApiStandardChange(value: string) {
    const prevStandard = currentSettings.apiStandard;
    if (prevStandard && prevStandard !== value) {
      // 切换前保存当前 provider 的配置
      currentSettings.providerConfigs = currentSettings.providerConfigs || {};
      currentSettings.providerConfigs[prevStandard] = {
        apiEndpoint: currentSettings.apiEndpoint,
        model: currentSettings.model,
        apiKey: currentSettings.apiKey,
      };
    }

    currentSettings.apiStandard = value;

    // 恢复目标 provider 的已保存配置，没有则用默认值
    const saved = currentSettings.providerConfigs?.[value];
    const defaults = providerDefaults[value];
    if (saved) {
      currentSettings.apiEndpoint = saved.apiEndpoint ?? defaults?.endpoint ?? '';
      currentSettings.model = saved.model ?? defaults?.model ?? '';
      currentSettings.apiKey = saved.apiKey ?? currentSettings.apiKey ?? '';
    } else if (defaults) {
      currentSettings.apiEndpoint = defaults.endpoint;
      currentSettings.model = defaults.model;
    }
  }

  function handleApiKeyToggle() {
    showApiKey = !showApiKey;
  }

  function handleThemeChange(theme: string) {
    currentSettings.theme = theme;
    applyTheme(theme);
    // 写穿透：先写主库，再回读权威结果同步缓存与 UI（不再只 invalidate 等下次重拉）
    cache.saveSettings({ theme })
      .then((fresh: any) => { if (fresh) currentSettings = { ...fresh }; toast.success('主题已切换'); })
      .catch((e) => toast.error('保存失败: ' + (e as Error).message));
  }

  async function handleLoadModels() {
    if (!currentSettings) {
      toast.info('请先加载设置');
      return;
    }

    if (!currentSettings.apiKey && currentSettings.apiStandard !== 'lm-studio') {
      toast.error('请先填写 API Key');
      return;
    }

    isLoadingModels = true;
    try {
      // 直接调用 Provider API 获取模型列表
      const apiStandard = currentSettings.apiStandard || 'openai';
      const apiEndpoint = currentSettings.apiEndpoint || '';
      const apiKey = currentSettings.apiKey || '';

      let modelsEndpoint = '';
      if (apiStandard === 'openrouter') {
        modelsEndpoint = apiEndpoint.replace(/\/$/, '') + '/models';
      } else if (apiStandard === 'openai') {
        modelsEndpoint = apiEndpoint.replace(/\/$/, '') + '/models';
      } else if (apiStandard === 'lm-studio') {
        modelsEndpoint = apiEndpoint.replace(/\/$/, '') + '/v1/models';
      } else {
        modelsEndpoint = apiEndpoint.replace(/\/$/, '') + '/models';
      }

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      Log.info('SettingsPage', `Fetching models from: ${modelsEndpoint}`);

      const response = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const result = await response.json();
      const models = (result.data || []).map((m: any) => {
        const inputModalities = normalizeModalities(m);
        return {
          id: m.id,
          name: m.name || m.id,
          created: m.created,
          owned_by: m.owned_by || m.owner || apiStandard,
          context_length: m.context_length || null,
          max_output_tokens: m.max_output_tokens || null,
          modality: m.architecture?.modality || 'text->text',
          input_modalities: inputModalities,
          pricing: m.pricing || null,
          supports_reasoning: (m.supported_parameters || []).includes('reasoning'),
          supports_tools: (m.supported_parameters || []).includes('tools'),
          supports_vision: inputModalities.includes('image') || inputModalities.includes('vision'),
          supports_audio: inputModalities.includes('audio'),
          supports_video: inputModalities.includes('video'),
          description: m.description || null,
          ...m
        };
      });

      currentSettings.models = models;

      // 写穿透：先写主库，再回读权威结果回填缓存
      await cache.saveSettings({ models });

      toast.success(`已加载 ${models.length} 个模型`);
    } catch (e) {
      toast.error('加载模型失败: ' + (e as Error).message);
      Log.error('SettingsPage', 'Failed to load models:', e);
    } finally {
      isLoadingModels = false;
    }
  }

  async function handleSave() {
    isSaving = true;
    try {
      // 关键：currentSettings 是 Svelte $state Proxy，必须剥离为纯 JS 对象再传给 Kernel
      const plainSettings = JSON.parse(JSON.stringify(currentSettings));
      // 写穿透：先写主库，再回读权威结果同步缓存与 UI（不再只 invalidate 等下次重拉）
      const fresh: any = await cache.saveSettings(plainSettings);
      currentSettings = { ...(fresh || plainSettings) };
      Log.info('SettingsPage', `Saved settings, models count: ${Array.isArray(plainSettings.models) ? plainSettings.models.length : 'N/A'}`);
      toast.success('设置已保存');
    } catch (e) {
      toast.error('保存失败: ' + (e as Error).message);
      Log.error('SettingsPage', 'Failed to save settings:', e);
    } finally {
      isSaving = false;
    }
  }

  function handleModelSearchClick() {
    if (!hasModels) {
      toast.info('请先点击"加载模型"按钮获取模型列表');
      return;
    }
    showModelDropdown = true;
  }

  function selectModel(modelId: string) {
    currentSettings.model = modelId;
    modelSearchValue = '';
    showModelDropdown = false;
  }


  function getModelDetails(modelId: string): ModelInfo | null {
    const model = modelsList.find((m: any) => {
      if (typeof m === 'string') return m === modelId;
      return m.id === modelId || m.name === modelId;
    });
    if (!model) return null;
    if (typeof model === 'string') {
      return { id: model, name: model };
    }
    const inputModalities: string[] = model.input_modalities ?? [];
    return {
      id: model.id || '',
      name: model.name || model.id || '',
      context_length: model.contextLength ?? model.context_length ?? undefined,
      pricing: model.pricing ?? undefined,
      input_modalities: inputModalities,
      description: model.description ?? model.metadata?.description ?? '',
      supports_reasoning: model.capabilities?.reasoning ?? model.supports_reasoning ?? false,
      supports_tools: model.capabilities?.toolUse ?? model.supports_tools ?? model.supports_function_calling ?? false,
      supports_json_mode: model.capabilities?.jsonMode ?? model.supports_json_mode ?? false,
      supports_vision: model.supports_vision ?? inputModalities.includes('image'),
      supports_audio: model.supports_audio ?? inputModalities.includes('audio'),
      supports_video: model.supports_video ?? inputModalities.includes('video'),
      links: model.links ?? {},
    };
  }

  function getExactMatchId(): string | null {
    if (!modelSearchValue) return null;
    const kw = modelSearchValue.toLowerCase();
    // 同时匹配模型ID和名称
    const model = modelsList.find((m: any) => {
      if (typeof m === 'string') return m.toLowerCase() === kw;
      const id = (m.id || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      return id === kw || name === kw;
    });
    if (!model) return null;
    return typeof model === 'object' ? model.id : model;
  }

  function getFilteredModelIds(): string[] {
    const all = modelsList.map((m: any) => (typeof m === 'object' ? m.id : m));
    if (!modelSearchValue) return all;
    const kw = modelSearchValue.toLowerCase();
    // 按匹配度排序：精准匹配 > 前缀匹配 > 包含匹配 > 其他
    // 不筛选，全部展示，但匹配的项排前面
    return all.sort((a: string, b: string) => {
      const aId = a.toLowerCase();
      const bId = b.toLowerCase();
      const aExact = aId === kw ? 0 : aId.startsWith(kw) ? 1 : aId.includes(kw) ? 2 : 3;
      const bExact = bId === kw ? 0 : bId.startsWith(kw) ? 1 : bId.includes(kw) ? 2 : 3;
      if (aExact !== bExact) return aExact - bExact;
      // 同等级按字母排序
      return aId.localeCompare(bId);
    });
  }

  function formatContextLength(len: number): string {
    if (len >= 1000000) return `${(len / 1000000).toFixed(0)}M`;
    if (len >= 1000) return `${(len / 1000).toFixed(0)}K`;
    return String(len);
  }

  function formatPricing(pricing: { prompt?: string; completion?: string }): string {
    if (!pricing) return '';
    const parts: string[] = [];
    if (pricing.prompt) {
      const price = parseFloat(pricing.prompt);
      if (price > 0) parts.push(`$${(price * 1000000).toFixed(2)}/M`);
    }
    return parts.join(' | ') || '免费';
  }

  // Click-outside for model dropdown
  function handleWindowClick(e: MouseEvent) {
    if (!showModelDropdown) return;
    const target = e.target as HTMLElement;
    const dropdown = document.getElementById('model-dropdown');
    const container = document.getElementById('model-search-container');
    const tooltip = document.querySelector('.search-tooltip') as HTMLElement;
    
    // 如果点击的是浮窗或下拉列表内部，不关闭
    if (tooltip && tooltip.contains(target)) return;
    if (dropdown && container && !container.contains(target)) {
      showModelDropdown = false;
    }
  }

  // 模型详情浮窗
  let hoveredModel = $state<ModelInfo | null>(null);
  let tooltipPosition = $state<{ x: number; y: number } | null>(null);
  let tooltipEl = $state<HTMLElement | null>(null);
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  function showModelTooltip(model: ModelInfo, e: MouseEvent) {
    // 清除之前的隐藏计时器
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    hoveredModel = model;
    
    const dropdown = document.getElementById('model-dropdown');
    const hoveredItem = e.target as HTMLElement;
    const itemRect = hoveredItem.getBoundingClientRect();
    const dropdownRect = dropdown ? dropdown.getBoundingClientRect() : itemRect;
    
    const viewportPadding = 8;
    const gap = 8;
    const tooltipWidth = 280;
    const tooltipHeight = 250; // 估算高度
    const isNarrowViewport = window.innerWidth < 500; // 侧边栏宽度较窄

    // 定位策略：宽视口优先左右，窄视口（侧边栏）优先上下，避免与下拉列表重叠
    let x: number;
    let y: number;

    if (!isNarrowViewport) {
      // 1. 尝试显示在下拉列表右侧
      const spaceRight = window.innerWidth - dropdownRect.right - viewportPadding;
      if (spaceRight >= tooltipWidth + gap) {
        x = dropdownRect.right + gap;
        y = itemRect.top;
      }
      // 2. 尝试显示在下拉列表左侧
      else if (dropdownRect.left >= tooltipWidth + gap + viewportPadding) {
        x = dropdownRect.left - gap - tooltipWidth;
        y = itemRect.top;
      }
      // 3. 空间不足，回退到上下定位
      else if (window.innerHeight - dropdownRect.bottom >= tooltipHeight + gap + viewportPadding) {
        x = dropdownRect.left + gap;
        y = dropdownRect.bottom + gap;
      } else {
        x = dropdownRect.left + gap;
        y = Math.max(viewportPadding, dropdownRect.top - gap - tooltipHeight);
      }
    } else {
      // 窄视口：始终使用上下定位，避免覆盖下拉列表
      if (window.innerHeight - dropdownRect.bottom >= tooltipHeight + gap + viewportPadding) {
        // 显示在下拉列表下方
        x = dropdownRect.left + gap;
        y = dropdownRect.bottom + gap;
      } else {
        // 显示在下拉列表上方
        x = dropdownRect.left + gap;
        y = Math.max(viewportPadding, dropdownRect.top - gap - tooltipHeight);
      }
    }

    // 确保不超出视口边界
    x = Math.max(viewportPadding, Math.min(x, window.innerWidth - tooltipWidth - viewportPadding));
    y = Math.max(viewportPadding, Math.min(y, window.innerHeight - tooltipHeight - viewportPadding));

    tooltipPosition = { x, y };
  }

  function hideModelTooltip() {
    // 延迟隐藏，确保用户有足够时间移动到浮窗上
    if (hideTimeout) {
      clearTimeout(hideTimeout);
    }
    
    hideTimeout = setTimeout(() => {
      hoveredModel = null;
      tooltipPosition = null;
      hideTimeout = null;
    }, 300); // 300ms 延迟
  }

  function cancelHideTooltip() {
    // 取消隐藏计时器（鼠标进入浮窗时调用）
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }

  // 浮窗渲染后，根据实际尺寸二次调整（防止溢出）
  $effect(() => {
    if (!hoveredModel || !tooltipPosition || !tooltipEl) return;

    const rect = tooltipEl.getBoundingClientRect();
    const viewportPadding = 8;
    let { x, y } = tooltipPosition;
    let adjusted = false;

    // 右侧溢出检查
    if (x + rect.width > window.innerWidth - viewportPadding) {
      x = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding);
      adjusted = true;
    }

    // 左侧溢出检查
    if (x < viewportPadding) {
      x = viewportPadding;
      adjusted = true;
    }

    // 底部溢出检查
    if (y + rect.height > window.innerHeight - viewportPadding) {
      y = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);
      adjusted = true;
    }

    // 顶部溢出检查
    if (y < viewportPadding) {
      y = viewportPadding;
      adjusted = true;
    }

    if (adjusted) {
      tooltipPosition = { x, y };
    }
  });
</script>

<svelte:window onclick={handleWindowClick} />

<div class="settings-page">
  {#if !isLoaded}
    <div class="loading-state">
      <div class="spinner-pulse"></div>
      <span>加载设置中…</span>
    </div>
  {:else}
    <!-- API 标准选择 -->
    <div class="settings-section">
      <h3 class="settings-section-title">API 标准</h3>
      <Card>
        <div class="provider-tabs">
          {#each apiStandardOptions as opt}
            <button
              class="provider-tab"
              class:active={apiStandard === opt.value}
              onclick={() => handleApiStandardChange(opt.value)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </Card>
    </div>

    <!-- Provider 配置 -->
    <div class="settings-section">
      <h3 class="settings-section-title">
        {apiStandardOptions.find(o => o.value === apiStandard)?.label} 配置
      </h3>
      <Card>
        <div class="settings-form-grid">
          {#if requiresApiKey}
            <div class="settings-form-row">
              <Input
                label="API Key"
                type={showApiKey ? 'text' : 'password'}
                placeholder="输入 API Key"
                value={currentSettings.apiKey ?? ''}
                oninput={(e) => currentSettings.apiKey = (e.target as HTMLInputElement).value}
              />
              <button class="settings-show-key-btn" onclick={handleApiKeyToggle} type="button">
                {showApiKey ? '🙈' : '👁️'}
              </button>
            </div>
          {/if}

          <Input
            label="API Endpoint"
            placeholder="https://api.example.com/v1"
            value={currentSettings.apiEndpoint ?? ''}
            oninput={(e) => currentSettings.apiEndpoint = (e.target as HTMLInputElement).value}
          />

          <Slider
            label="Temperature"
            min={0}
            max={2}
            step={0.1}
            value={currentSettings.temperature ?? 0.7}
            format={(v) => v.toFixed(1)}
            onchange={(v) => currentSettings.temperature = v}
          />

          <Input
            label="Maximum Tokens"
            type="number"
            placeholder="4000"
            value={String(currentSettings.maxTokens ?? 4000)}
            oninput={(e) => currentSettings.maxTokens = parseInt((e.target as HTMLInputElement).value) || 4000}
          />

          <div class="settings-form-field">
            <label class="settings-form-label" for="settings-system-prompt">System Prompt</label>
            <textarea
              id="settings-system-prompt"
              class="settings-textarea"
              placeholder="可选，设置 AI 的行为和角色"
              rows="3"
              value={currentSettings.systemPrompt ?? ''}
              oninput={(e) => currentSettings.systemPrompt = (e.target as HTMLTextAreaElement).value}
            ></textarea>
          </div>

          <Select
            label="默认思考强度 (Reasoning Effort)"
            options={reasoningEffortOptions}
            value={currentSettings.reasoningEffort ?? 'medium'}
            onchange={(v) => currentSettings.reasoningEffort = v}
          />
        </div>
      </Card>
    </div>

    <!-- 模型选择 -->
    <div class="settings-section">
      <h3 class="settings-section-title">模型</h3>
      <Card>
        <div class="model-area">
          <div id="model-search-container" class="model-search-row">
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div class="model-input-wrapper" role="button" tabindex="0" onclick={handleModelSearchClick} onkeydown={(e) => { if (e.key === 'Enter') handleModelSearchClick(); }}>
              <input
                class="model-search-input"
                placeholder={hasModels ? '搜索模型 ID 或名称…' : '点击"加载模型"获取列表'}
                value={modelSearchValue || currentSettings.model || ''}
                oninput={(e) => {
                  modelSearchValue = (e.target as HTMLInputElement).value;
                  showModelDropdown = true;
                }}
                onfocus={handleModelSearchClick}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={isLoadingModels}
              onclick={handleLoadModels}
            >
              {isLoadingModels ? '加载中…' : '加载模型'}
            </Button>
          </div>

          {#if hasModels}
            <div class="model-cache-hint">
              已缓存 {modelsList.length} 个模型
            </div>
          {/if}

          {#if showModelDropdown}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div id="model-dropdown" class="search-dropdown">
              {#each getFilteredModelIds() as modelId, index}
                {@const details = getModelDetails(modelId)}
                {#if details}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="search-dropdown-item"
                    class:selected={modelId === currentSettings.model}
                    class:exact-match={index === 0 && getExactMatchId() === modelId}
                    onclick={() => selectModel(modelId)}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectModel(modelId); }}
                    onmouseenter={(e) => showModelTooltip(details, e)}
                    onmouseleave={hideModelTooltip}
                    role="option"
                    aria-selected={modelId === currentSettings.model}
                    tabindex="0"
                  >
                    <div class="search-dropdown-item-name">
                      {index === 0 && getExactMatchId() === modelId ? '✅ ' : ''}{details.name}
                    </div>
                    <div class="search-dropdown-item-meta">
                      {#if details.context_length}
                        <Badge variant="info">📝 {formatContextLength(details.context_length)}</Badge>
                      {/if}
                      {#if details.pricing}
                        {#if formatPricing(details.pricing)}
                          <Badge variant="success">💰 {formatPricing(details.pricing)}</Badge>
                        {/if}
                      {/if}
                      {#if details.supports_tools}
                        <Badge variant="primary">🔧 工具</Badge>
                      {/if}
                      {#if details.supports_reasoning}
                        <Badge variant="warning">🧠 推理</Badge>
                      {/if}
                    </div>
                    {#if details.description}
                      <div class="search-dropdown-item-desc">
                        {details.description.length > 120
                          ? details.description.slice(0, 120) + '…'
                          : details.description}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}

              {#if getFilteredModelIds().length === 0}
                <div class="search-no-results">无匹配模型</div>
              {/if}
            </div>

            <!-- 模型详情浮窗 -->
            {#if hoveredModel && tooltipPosition}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="search-tooltip"
                bind:this={tooltipEl}
                style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;"
                onmouseenter={cancelHideTooltip}
                onmouseleave={hideModelTooltip}
              >
                <div class="search-tooltip-header">
                  <strong>{hoveredModel.name}</strong>
                </div>
                {#if hoveredModel.id !== hoveredModel.name}
                  <div class="search-tooltip-id">{hoveredModel.id}</div>
                {/if}
                {#if hoveredModel.description}
                  <div class="search-tooltip-desc">{hoveredModel.description}</div>
                {/if}
                {#if hoveredModel.context_length}
                  <div class="search-tooltip-row">
                    <span>上下文:</span>
                    <span>{formatContextLength(hoveredModel.context_length)} tokens</span>
                  </div>
                {/if}
                {#if hoveredModel.pricing}
                  <div class="search-tooltip-row">
                    <span>价格:</span>
                    <span>{formatPricing(hoveredModel.pricing)}</span>
                  </div>
                {/if}
                {#if hoveredModel.input_modalities && hoveredModel.input_modalities.length > 0}
                  <div class="search-tooltip-row">
                    <span>输入:</span>
                    <span>{hoveredModel.input_modalities.join(', ')}</span>
                  </div>
                {/if}
                <div class="search-tooltip-capabilities">
                  {#if hoveredModel.supports_reasoning}
                    <span class="search-tooltip-cap">🧠 推理</span>
                  {/if}
                  {#if hoveredModel.supports_tools}
                    <span class="search-tooltip-cap">🔧 工具调用</span>
                  {/if}
                  {#if hoveredModel.supports_json_mode}
                    <span class="search-tooltip-cap">📄 JSON 模式</span>
                  {/if}
                  {#if hoveredModel.supports_vision}
                    <span class="search-tooltip-cap">👁 视觉</span>
                  {/if}
                  {#if hoveredModel.supports_audio}
                    <span class="search-tooltip-cap">🎵 音频</span>
                  {/if}
                  {#if hoveredModel.supports_video}
                    <span class="search-tooltip-cap">🎬 视频</span>
                  {/if}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      </Card>
    </div>

    <!-- 上下文管理 -->
    <div class="settings-section">
      <h3 class="settings-section-title">上下文</h3>
      <Card>
        <Switch
          label="自动调整上下文窗口（根据模型限制智能截断历史消息）"
          checked={currentSettings.autoContextTruncation !== false}
          onchange={(v) => currentSettings.autoContextTruncation = v}
        />
      </Card>
    </div>

    <!-- 主题 -->
    <div class="settings-section">
      <h3 class="settings-section-title">主题</h3>
      <div class="theme-grid">
        <button
          class="theme-card"
          class:active={currentSettings.theme !== 'dark'}
          onclick={() => handleThemeChange('light')}
          type="button"
        >
          <div class="theme-preview theme-preview--light">
            <div class="theme-preview-bar"></div>
            <div class="theme-preview-body">
              <div class="theme-preview-side"></div>
              <div class="theme-preview-content">
                <div class="theme-preview-line theme-preview-line--1"></div>
                <div class="theme-preview-line theme-preview-line--2"></div>
              </div>
            </div>
          </div>
          <span class="theme-label">浅色模式</span>
        </button>
        <button
          class="theme-card"
          class:active={currentSettings.theme === 'dark'}
          onclick={() => handleThemeChange('dark')}
          type="button"
        >
          <div class="theme-preview theme-preview--dark">
            <div class="theme-preview-bar"></div>
            <div class="theme-preview-body">
              <div class="theme-preview-side"></div>
              <div class="theme-preview-content">
                <div class="theme-preview-line theme-preview-line--1"></div>
                <div class="theme-preview-line theme-preview-line--2"></div>
              </div>
            </div>
          </div>
          <span class="theme-label">深色模式</span>
        </button>
      </div>
    </div>

    <!-- 资源服务器（媒体上传后端） -->
    <div class="settings-section">
      <h3 class="settings-section-title">资源服务器</h3>
      <Card>
        <div class="settings-form-grid">
          <Switch
            label="启用远端资源服务器（关闭则媒体存本地 IndexedDB）"
            checked={currentSettings.resourceServer.enabled === true}
            onchange={(v) => currentSettings.resourceServer.enabled = v}
          />
          <Select
            label="图床类型"
            options={[
              { value: 'generic', label: '通用（自托管 / 对象存储）' },
              { value: 'imgbb', label: 'ImgBB (api.imgbb.com)' },
            ]}
            value={currentSettings.resourceServer.provider || 'generic'}
            onchange={(v) => {
              currentSettings.resourceServer.provider = v;
              if (v === 'imgbb') {
                // 选 ImgBB 时自动填充标准端点与字段，用户只需填 API Key
                currentSettings.resourceServer.uploadUrl = 'https://api.imgbb.com/1/upload';
                currentSettings.resourceServer.fieldName = 'image';
                currentSettings.resourceServer.responseUrlField = 'data.url';
                currentSettings.resourceServer.method = 'POST';
                currentSettings.resourceServer.authHeader = '';
                currentSettings.resourceServer.authToken = '';
              }
            }}
          />
          {#if currentSettings.resourceServer.provider === 'imgbb'}
            <Input
              label="ImgBB API Key"
              type="password"
              placeholder="在 https://api.imgbb.com/ 注册获取的 API Key"
              value={currentSettings.resourceServer.apiKey ?? ''}
              oninput={(e) => currentSettings.resourceServer.apiKey = (e.target as HTMLInputElement).value}
            />
          {:else}
            <Input
              label="上传链接 (Upload URL)"
              placeholder="https://your-server.example.com/upload"
              value={currentSettings.resourceServer.uploadUrl ?? ''}
              oninput={(e) => currentSettings.resourceServer.uploadUrl = (e.target as HTMLInputElement).value}
            />
            <Select
              label="HTTP 方法"
              options={[{ value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' }]}
              value={currentSettings.resourceServer.method ?? 'POST'}
              onchange={(v) => currentSettings.resourceServer.method = v}
            />
            <Input
              label="鉴权请求头名（可选，如 Authorization）"
              placeholder="Authorization"
              value={currentSettings.resourceServer.authHeader ?? ''}
              oninput={(e) => currentSettings.resourceServer.authHeader = (e.target as HTMLInputElement).value}
            />
            <Input
              label="鉴权令牌（可选）"
              type="password"
              placeholder="Bearer xxx / Token xxx"
              value={currentSettings.resourceServer.authToken ?? ''}
              oninput={(e) => currentSettings.resourceServer.authToken = (e.target as HTMLInputElement).value}
            />
          {/if}
          <Input
            label="响应取 URL 的字段名（默认自动识别 url/link 等，可留空；支持点路径如 data.url）"
            placeholder="自动识别"
            value={currentSettings.resourceServer.responseUrlField ?? ''}
            oninput={(e) => currentSettings.resourceServer.responseUrlField = (e.target as HTMLInputElement).value}
          />
          <Input
            label="URL 前缀（可选，拼到返回 URL 前）"
            placeholder="https://cdn.example.com/"
            value={currentSettings.resourceServer.urlPrefix ?? ''}
            oninput={(e) => currentSettings.resourceServer.urlPrefix = (e.target as HTMLInputElement).value}
          />
          <p class="settings-hint">
            {#if currentSettings.resourceServer.provider === 'imgbb'}
              启用后图片上传到 ImgBB，返回 <code>i.ibb.co</code> 公网直链。ImgBB 直链公开可访问，通常对 OpenRouter / 模型服务端可见，可解决免费图床（如 hd-r.cn）反盗链导致模型看不到图的问题。免费版有上传频率与流量限制，请自行评估。
            {:else}
              启用后，上传的媒体会发送到你的服务器并返回公网 URL 存入消息（图片以直链发送，更省请求体积）。上传失败将直接报错，不会静默回退本地。<strong>注意：</strong>公网直链必须能被模型服务端访问；部分免费图床（如 hd-r.cn）有反盗链，会导致模型看不到图片，建议用可公开访问的存储或关闭此选项走本地 base64 内联。
            {/if}
          </p>
        </div>
      </Card>
    </div>

    <!-- 保存按钮 -->
    <div class="save-area">
      <Button
        variant="primary"
        fullWidth
        loading={isSaving}
        onclick={handleSave}
      >
        保存设置
      </Button>
    </div>
  {/if}
</div>

