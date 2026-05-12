/**
 * MessageModels 序列化/反序列化测试
 */

(function() {
  'use strict';
  
  console.log('[MessageModels Test] Starting serialization tests...');
  
  const { Message, TextBlock, ToolUseBlock, ToolResultBlock, ThinkingBlock } = window.MessageModels;
  
  // 测试1: TextBlock 序列化
  console.log('\n=== Test 1: TextBlock ===');
  const textBlock = new TextBlock('Hello, World!');
  const textJson = textBlock.toJSON();
  console.log('Original:', textBlock);
  console.log('JSON:', textJson);
  const restoredText = TextBlock.fromJSON(textJson);
  console.log('Restored:', restoredText);
  console.log('Match:', textBlock.text === restoredText.text ? '✓' : '✗');
  
  // 测试2: ToolUseBlock 序列化
  console.log('\n=== Test 2: ToolUseBlock ===');
  const toolUse = new ToolUseBlock('call_123', 'search', { query: 'test' });
  const toolUseJson = toolUse.toJSON();
  console.log('Original:', toolUse);
  console.log('JSON:', toolUseJson);
  const restoredToolUse = ToolUseBlock.fromJSON(toolUseJson);
  console.log('Restored:', restoredToolUse);
  console.log('Match:', toolUse.id === restoredToolUse.id && toolUse.name === restoredToolUse.name ? '✓' : '✗');
  
  // 测试3: Message 简单文本序列化
  console.log('\n=== Test 3: Message (simple text) ===');
  const simpleMsg = new Message('user', '你好');
  const simpleJson = simpleMsg.toJSON();
  console.log('Original:', simpleMsg);
  console.log('JSON:', JSON.stringify(simpleJson, null, 2));
  const restoredSimple = Message.fromJSON(simpleJson);
  console.log('Restored:', restoredSimple);
  console.log('Match:', simpleMsg.content === restoredSimple.content ? '✓' : '✗');
  
  // 测试4: Message 带内容块数组序列化
  console.log('\n=== Test 4: Message (content blocks) ===');
  const complexMsg = new Message('assistant', [
    new TextBlock('让我帮你搜索'),
    new ToolUseBlock('call_456', 'search', { query: 'weather' })
  ]);
  const complexJson = complexMsg.toJSON();
  console.log('Original content length:', complexMsg.content.length);
  console.log('JSON:', JSON.stringify(complexJson, null, 2));
  const restoredComplex = Message.fromJSON(complexJson);
  console.log('Restored content length:', restoredComplex.content.length);
  console.log('First block type:', restoredComplex.content[0].type);
  console.log('Second block type:', restoredComplex.content[1].type);
  console.log('Match:', 
    restoredComplex.content.length === 2 &&
    restoredComplex.content[0] instanceof TextBlock &&
    restoredComplex.content[1] instanceof ToolUseBlock ? '✓' : '✗');
  
  // 测试5: 完整会话序列化（模拟 storage 存储）
  console.log('\n=== Test 5: Full session serialization ===');
  const messages = [
    new Message('user', '今天天气怎么样？'),
    new Message('assistant', [
      new TextBlock('我来帮你查询'),
      new ToolUseBlock('call_789', 'get_weather', { location: '北京' })
    ]),
    new Message('tool', '晴天，温度25°C', { tool_call_id: 'call_789' }),
    new Message('assistant', '北京今天是晴天，温度25°C')
  ];
  
  // 序列化为 JSON
  const serialized = messages.map(msg => msg.toJSON());
  const jsonString = JSON.stringify(serialized);
  console.log('Serialized to JSON string length:', jsonString.length);
  
  // 从 JSON 恢复
  const deserialized = JSON.parse(jsonString);
  const restoredMessages = deserialized.map(json => Message.fromJSON(json));
  
  console.log('Original messages count:', messages.length);
  console.log('Restored messages count:', restoredMessages.length);
  console.log('First message role:', restoredMessages[0].role);
  console.log('Second message has tool_calls:', restoredMessages[1].hasToolCalls());
  console.log('Third message is tool:', restoredMessages[2].role === 'tool');
  console.log('Fourth message content:', restoredMessages[3].content);
  console.log('All match:', messages.length === restoredMessages.length ? '✓' : '✗');
  
  console.log('\n=== All tests completed ===');
})();
