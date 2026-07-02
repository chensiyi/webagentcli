<script lang="ts">
  import Button from '../components/ui/Button.svelte';
  import Input from '../components/ui/Input.svelte';
  import Select from '../components/ui/Select.svelte';
  import Switch from '../components/ui/Switch.svelte';
  import Slider from '../components/ui/Slider.svelte';
  import Badge from '../components/ui/Badge.svelte';
  import Card from '../components/ui/Card.svelte';
  import { useKernel } from '../lib/kernel-context.js';
  import { useToast } from '../lib/stores/toast.svelte.js';
  import { Log } from '../../kernel/services/Log.js';

  const kernel = useKernel<any>();
  const toast = useToast();

  // ---------- Reactive State ----------
  let currentSettings = $state<Record<string, any>>({});
  let cachedModels = $state<ModelInfo[]>([]);
  let isLoadingModels = $state(false);
  let modelSearchValue = $state('');
  let showModelDropdown = $state(false);
  let showApiKey = $state(false);
  let isSaving = $state(false);
  let isLoaded = $state(false);

  // ---------- Computed ----------
  const apiStandard = $derived(currentSettings.apiStandard || 'openrouter');
  const requiresApiKey = $derived(apiStandard !== 'lm-studio');

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
    input_modalities?: string[];
    inputModalities?: string[];
    description?: string;
    supports_reasoning?: boolean;
    supports_tools?: boolean;
    supports_function_calling?: boolean;
    supports_json_mode?: boolean;
    links?: { details?: string };
    capabilities?: Record<string, boolean>;
    metadata?: { description?: string };
  }

  // ---------- Init: Load Settings ----------
  $effect(() => {
    const sm = kernel?.getSettingsManager?.();
    if (!sm || isLoaded) return;

    const raw = sm.getSettings?.();
    currentSettings = raw?.toJSON ? raw.toJSON() : (typeof raw === 'object' ? { ...raw } : {});
    isLoaded = true;

    applyTheme(currentSettings.theme);

    if (Array.isArray(currentSettings.models)) {
      cachedModels = currentSettings.models;
    }
  });

  // ---------- Handlers ----------
  function applyTheme(theme: string | undefined) {
    if (theme === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  function handleApiStandardChange(value: string) {
    currentSettings.apiStandard = value;
    const defaults = providerDefaults[value];
    if (defaults) {
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
    const sm = kernel?.getSettingsManager?.();
    sm?.saveSetting?.('theme', theme);
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
      const models = (result.data || []).map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        created: m.created,
        owned_by: m.owned_by || m.owner || apiStandard,
        context_length: m.context_length || null,
        max_output_tokens: m.max_output_tokens || null,
        modality: m.architecture?.modality || 'text->text',
        modalities: m.architectures || [],
        pricing: m.pricing || null,
        supports_reasoning: (m.supported_parameters || []).includes('reasoning'),
        supports_tools: (m.supported_parameters || []).includes('tools'),
        description: m.description || null,
        ...m
      }));

      cachedModels = models;
      currentSettings.models = models;
      
      // 保存到存储
      const sm = kernel?.getSettingsManager?.();
      if (sm?.saveSetting) {
        await sm.saveSetting('models', models);
      }

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
      const sm = kernel?.getSettingsManager?.();
      const ipc = kernel?.getIPC?.();
      const channel = ipc?.getOrCreateChannel?.('settings') || ipc;

      // Save via SettingsManager (persists to storage + emits settings:saved for ProviderFactory)
      if (sm?.saveSettings) {
        await sm.saveSettings(currentSettings);
      }

      toast.success('设置已保存');
    } catch (e) {
      toast.error('保存失败: ' + (e as Error).message);
    } finally {
      isSaving = false;
    }
  }

  function handleModelSearchClick() {
    if (cachedModels.length === 0) {
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
    const model = cachedModels.find((m: any) => {
      if (typeof m === 'string') return m === modelId;
      return m.id === modelId || m.name === modelId;
    });
    if (!model) return null;
    if (typeof model === 'string') {
      return { id: model, name: model };
    }
    return {
      id: model.id || '',
      name: model.name || model.id || '',
      context_length: model.contextLength ?? model.context_length ?? undefined,
      pricing: model.pricing ?? undefined,
      input_modalities: model.inputModalities ?? model.input_modalities ?? [],
      description: model.description ?? model.metadata?.description ?? '',
      supports_reasoning: model.capabilities?.reasoning ?? model.supports_reasoning ?? false,
      supports_tools: model.capabilities?.toolUse ?? model.supports_tools ?? model.supports_function_calling ?? false,
      supports_json_mode: model.capabilities?.jsonMode ?? model.supports_json_mode ?? false,
      links: model.links ?? {},
    };
  }

  function getExactMatchId(): string | null {
    if (!modelSearchValue) return null;
    const kw = modelSearchValue.toLowerCase();
    // 同时匹配模型ID和名称
    const model = cachedModels.find((m: any) => {
      if (typeof m === 'string') return m.toLowerCase() === kw;
      const id = (m.id || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      return id === kw || name === kw;
    });
    if (!model) return null;
    return typeof model === 'object' ? model.id : model;
  }

  function getFilteredModelIds(): string[] {
    const all = cachedModels.map((m: any) => (typeof m === 'object' ? m.id : m));
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
    const tooltip = document.querySelector('.model-tooltip') as HTMLElement;
    
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
    <div class="section">
      <h3 class="section-title">API 标准</h3>
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
    <div class="section">
      <h3 class="section-title">
        {apiStandardOptions.find(o => o.value === apiStandard)?.label} 配置
      </h3>
      <Card>
        <div class="form-grid">
          {#if requiresApiKey}
            <div class="form-row">
              <Input
                label="API Key"
                type={showApiKey ? 'text' : 'password'}
                placeholder="输入 API Key"
                value={currentSettings.apiKey ?? ''}
                oninput={(e) => currentSettings.apiKey = (e.target as HTMLInputElement).value}
              />
              <button class="show-key-btn" onclick={handleApiKeyToggle} type="button">
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

          <div class="form-field">
            <label class="form-label" for="settings-system-prompt">System Prompt</label>
            <textarea
              id="settings-system-prompt"
              class="textarea"
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
    <div class="section">
      <h3 class="section-title">模型</h3>
      <Card>
        <div class="model-area">
          <div id="model-search-container" class="model-search-row">
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div class="model-input-wrapper" role="button" tabindex="0" onclick={handleModelSearchClick} onkeydown={(e) => { if (e.key === 'Enter') handleModelSearchClick(); }}>
              <input
                class="model-search-input"
                placeholder={cachedModels.length === 0 ? '点击"加载模型"获取列表' : '搜索模型 ID 或名称…'}
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

          {#if cachedModels.length > 0}
            <div class="model-cache-hint">
              已缓存 {cachedModels.length} 个模型
            </div>
          {/if}

          {#if showModelDropdown}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div id="model-dropdown" class="model-dropdown">
              {#each getFilteredModelIds() as modelId, index}
                {@const details = getModelDetails(modelId)}
                {#if details}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="model-item"
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
                    <div class="model-item-name">
                      {index === 0 && getExactMatchId() === modelId ? '✅ ' : ''}{details.name}
                    </div>
                    <div class="model-item-meta">
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
                      <div class="model-item-desc">
                        {details.description.length > 120
                          ? details.description.slice(0, 120) + '…'
                          : details.description}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}

              {#if getFilteredModelIds().length === 0}
                <div class="model-no-results">无匹配模型</div>
              {/if}
            </div>

            <!-- 模型详情浮窗 -->
            {#if hoveredModel && tooltipPosition}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="model-tooltip"
                bind:this={tooltipEl}
                style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;"
                onmouseenter={cancelHideTooltip}
                onmouseleave={hideModelTooltip}
              >
                <div class="tooltip-header">
                  <strong>{hoveredModel.name}</strong>
                </div>
                {#if hoveredModel.id !== hoveredModel.name}
                  <div class="tooltip-id">{hoveredModel.id}</div>
                {/if}
                {#if hoveredModel.description}
                  <div class="tooltip-desc">{hoveredModel.description}</div>
                {/if}
                {#if hoveredModel.context_length}
                  <div class="tooltip-row">
                    <span>上下文:</span>
                    <span>{formatContextLength(hoveredModel.context_length)} tokens</span>
                  </div>
                {/if}
                {#if hoveredModel.pricing}
                  <div class="tooltip-row">
                    <span>价格:</span>
                    <span>{formatPricing(hoveredModel.pricing)}</span>
                  </div>
                {/if}
                {#if hoveredModel.input_modalities && hoveredModel.input_modalities.length > 0}
                  <div class="tooltip-row">
                    <span>输入:</span>
                    <span>{hoveredModel.input_modalities.join(', ')}</span>
                  </div>
                {/if}
                <div class="tooltip-capabilities">
                  {#if hoveredModel.supports_reasoning}
                    <span class="tooltip-cap">🧠 推理</span>
                  {/if}
                  {#if hoveredModel.supports_tools}
                    <span class="tooltip-cap">🔧 工具调用</span>
                  {/if}
                  {#if hoveredModel.supports_json_mode}
                    <span class="tooltip-cap">📄 JSON 模式</span>
                  {/if}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      </Card>
    </div>

    <!-- 上下文管理 -->
    <div class="section">
      <h3 class="section-title">上下文</h3>
      <Card>
        <Switch
          label="自动调整上下文窗口（根据模型限制智能截断历史消息）"
          checked={currentSettings.autoContextTruncation !== false}
          onchange={(v) => currentSettings.autoContextTruncation = v}
        />
      </Card>
    </div>

    <!-- 主题 -->
    <div class="section">
      <h3 class="section-title">主题</h3>
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

<style>
  .settings-page {
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    overflow-y: auto;
  }

  /* ---- Loading ---- */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-16) var(--space-8);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .spinner-pulse {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ---- Section ---- */
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .section-title {
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--color-text-hint);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
    padding-left: 2px;
  }

  /* ---- Provider Tabs ---- */
  .provider-tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg);
    border-radius: var(--radius-lg);
  }

  .provider-tab {
    flex: 1;
    height: 32px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .provider-tab:hover:not(.active) {
    color: var(--color-text);
    background: var(--color-surface-hover);
  }

  .provider-tab.active {
    background: var(--color-surface);
    color: var(--color-primary);
    font-weight: 600;
    box-shadow: var(--shadow-sm);
  }

  /* ---- Form Grid ---- */
  .form-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .form-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .form-row {
    position: relative;
  }

  .show-key-btn {
    position: absolute;
    right: 8px;
    top: 28px;
    width: 28px;
    height: 24px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }

  /* ---- Textarea ---- */
  .textarea {
    width: 100%;
    min-height: 60px;
    padding: var(--space-2) var(--space-3);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    outline: none;
    resize: vertical;
    transition: all var(--transition-fast);
    line-height: 1.5;
  }

  .textarea::placeholder {
    color: var(--color-text-hint);
  }

  .textarea:focus {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-focus);
  }

  /* ---- Model Area ---- */
  .model-area {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    position: relative;
  }

  .model-search-row {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
  }

  .model-input-wrapper {
    flex: 1;
    cursor: pointer;
  }

  .model-search-input {
    width: 100%;
    height: 34px;
    padding: 0 var(--space-3);
    font-family: var(--font-sans);
    font-size: var(--text-md);
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    outline: none;
    transition: all var(--transition-fast);
    box-sizing: border-box;
  }

  .model-search-input::placeholder {
    color: var(--color-text-hint);
  }

  .model-search-input:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .model-search-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(55, 138, 221, 0.15);
  }

  .model-cache-hint {
    font-size: var(--text-xs);
    color: var(--color-text-hint);
    padding-left: 2px;
  }

  .model-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 220px;
    overflow-y: auto;
    margin-top: 4px;
    background: var(--color-surface);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 100;
    padding: var(--space-1);
  }

  .model-item {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
    border: 1px solid transparent;
  }

  .model-item:hover {
    background: var(--color-primary-light);
  }

  .model-item.selected {
    background: var(--color-primary-light);
    border-color: var(--color-primary);
  }

  .model-item-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 4px;
    word-break: break-all;
  }

  .model-item-meta {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .model-item-desc {
    font-size: 11px;
    color: var(--color-text-secondary);
    margin-top: 4px;
    line-height: 1.4;
  }

  .model-item.exact-match {
    background: var(--color-primary-light);
    border-left: 3px solid var(--color-primary);
  }

  .model-item.exact-match:hover:not(.selected) {
    background: var(--color-surface-hover);
  }

  .model-no-results {
    padding: var(--space-4);
    text-align: center;
    font-size: var(--text-sm);
    color: var(--color-text-hint);
  }

  /* ---- Theme Grid ---- */
  .theme-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .theme-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-surface);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .theme-card:hover:not(.active) {
    border-color: var(--color-border-medium);
    box-shadow: var(--shadow-sm);
  }

  .theme-card.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .theme-preview {
    width: 100%;
    height: 60px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .theme-preview-bar {
    height: 8px;
    background: var(--color-primary);
  }

  .theme-preview-body {
    flex: 1;
    display: flex;
    padding: 4px;
    gap: 4px;
  }

  .theme-preview-side {
    width: 16px;
    border-radius: 2px;
    background: rgba(0,0,0,0.1);
  }

  .theme-preview-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px 0;
  }

  .theme-preview-line {
    height: 4px;
    border-radius: 2px;
  }

  .theme-preview-line--1 { width: 70%; }
  .theme-preview-line--2 { width: 40%; }

  .theme-preview--light {
    background: #f5f7fa;
  }

  .theme-preview--light .theme-preview-line {
    background: rgba(0,0,0,0.15);
  }

  .theme-preview--dark {
    background: #1a1d21;
  }

  .theme-preview--dark .theme-preview-line {
    background: rgba(255,255,255,0.15);
  }

  .theme-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  /* ---- Model Tooltip ---- */
  .model-tooltip {
    position: fixed;
    z-index: 200;
    width: min(280px, calc(100vw - 16px));
    max-height: calc(100vh - 16px);
    padding: var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    font-size: var(--text-xs);
    pointer-events: auto;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .tooltip-header {
    margin-bottom: var(--space-1);
  }

  .tooltip-header strong {
    font-size: var(--text-sm);
    color: var(--color-text);
    line-height: 1.4;
    display: block;
  }

  .tooltip-id {
    font-size: 10px;
    color: var(--color-text-hint);
    font-family: monospace;
    background: var(--color-bg);
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-light);
    word-break: break-all;
    line-height: 1.4;
    margin-bottom: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border-light);
  }

  .tooltip-desc {
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin-bottom: var(--space-2);
    max-height: 60px;
    overflow-y: auto;
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 2px 0;
    color: var(--color-text-secondary);
  }

  .tooltip-row span:first-child {
    font-weight: 600;
    color: var(--color-text-hint);
  }

  .tooltip-capabilities {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-light);
  }

  .tooltip-cap {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  /* ---- Save Area ---- */
  .save-area {
    padding-top: var(--space-2);
    padding-bottom: var(--space-4);
  }
</style>
