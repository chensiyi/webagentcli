// 适配器测试脚本
// 在浏览器控制台中运行此脚本来验证适配器是否正确加载

console.log('=== API 适配器架构测试 ===\n');

// 1. 检查 AdapterManager 是否存在
console.log('1. 检查 AdapterManager...');
if (window.AdapterManager) {
  console.log('✅ AdapterManager 已加载');
  console.log('   可用适配器:', window.AdapterManager.getAvailableAdapters());
} else {
  console.error('❌ AdapterManager 未加载');
}

// 2. 检查各个适配器类是否存在
console.log('\n2. 检查适配器类...');
const adapterClasses = [
  'OpenAIAdapter',
  'LMStudioAdapter', 
  'OllamaAdapter',
  'OpenRouterAdapter',
  'AnthropicAdapter'
];

adapterClasses.forEach(className => {
  if (typeof window[className] !== 'undefined') {
    console.log(`✅ ${className} 已加载`);
  } else {
    console.error(`❌ ${className} 未加载`);
  }
});

// 3. 测试适配器选择和配置
console.log('\n3. 测试适配器选择...');
try {
  // 测试 OpenAI 适配器
  window.AdapterManager.select('openai');
  window.AdapterManager.configure({
    endpoint: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    defaultModel: 'gpt-4'
  });
  console.log('✅ OpenAI 适配器选择和配置成功');
  
  // 测试 LM Studio 适配器
  window.AdapterManager.select('lm-studio');
  window.AdapterManager.configure({
    endpoint: 'http://localhost:1234/v1',
    defaultModel: 'local-model'
  });
  console.log('✅ LM Studio 适配器选择和配置成功');
  
  // 测试 Ollama 适配器
  window.AdapterManager.select('ollama');
  window.AdapterManager.configure({
    endpoint: 'http://localhost:11434',
    defaultModel: 'llama2'
  });
  console.log('✅ Ollama 适配器选择和配置成功');
  
  // 测试 OpenRouter 适配器
  window.AdapterManager.select('openrouter');
  window.AdapterManager.configure({
    endpoint: 'https://openrouter.ai/api/v1',
    apiKey: 'test-key',
    defaultModel: 'openai/gpt-4o'
  });
  console.log('✅ OpenRouter 适配器选择和配置成功');
  
  // 测试 Anthropic 适配器
  window.AdapterManager.select('anthropic');
  window.AdapterManager.configure({
    endpoint: 'https://api.anthropic.com/v1',
    apiKey: 'test-key',
    defaultModel: 'claude-3-opus-20240229'
  });
  console.log('✅ Anthropic 适配器选择和配置成功');
  
} catch (error) {
  console.error('❌ 适配器选择或配置失败:', error.message);
}

// 4. 测试适配器方法
console.log('\n4. 测试适配器方法...');
try {
  window.AdapterManager.select('openai');
  const adapter = window.AdapterManager.getCurrentAdapter();
  
  // 测试 buildUrl
  const url = adapter.buildUrl('/chat/completions');
  console.log('✅ buildUrl 测试:', url);
  
  // 测试 buildHeaders
  const headers = adapter.buildHeaders();
  console.log('✅ buildHeaders 测试:', Object.keys(headers));
  
  // 测试 formatMessages
  const messages = adapter.formatMessages([
    { role: 'user', content: 'Hello' }
  ]);
  console.log('✅ formatMessages 测试:', messages.length, '条消息');
  
  // 测试 buildRequestBody
  const body = adapter.buildRequestBody({
    model: 'gpt-4',
    messages: messages,
    temperature: 0.7,
    stream: false
  });
  console.log('✅ buildRequestBody 测试:', Object.keys(body));
  
} catch (error) {
  console.error('❌ 适配器方法测试失败:', error.message);
}

// 5. 测试 ModelManager 集成
console.log('\n5. 测试 ModelManager 集成...');
if (window.ModelManager) {
  console.log('✅ ModelManager 已加载');
  console.log('   fetchModels 方法签名:', window.ModelManager.fetchModels.toString().substring(0, 100));
} else {
  console.error('❌ ModelManager 未加载');
}

// 6. 测试 Agent 集成
console.log('\n6. 测试 Agent 集成...');
if (window.Agent) {
  console.log('✅ Agent 类已加载');
  const agent = new window.Agent();
  console.log('   AdapterManager 引用:', agent.adapterManager ? '存在' : '不存在');
} else {
  console.error('❌ Agent 类未加载');
}

console.log('\n=== 测试完成 ===');
