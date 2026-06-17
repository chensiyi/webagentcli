import IProviderAPIService from '../IProviderAPIService.js';

export default class OpenAIService extends IProviderAPIService {
  constructor() { super(); this.name = 'openai'; }

  buildUrl(path) {
    const base = (this.config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
    return `${base}${path}`;
  }
  buildHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` };
  }
  buildRequestBody(request) {
    return {
      model: request.model,
      messages: request.messages,
      stream: !!request.stream,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      tools: request.tools || undefined,
    };
  }
  _buildStandardResponse(choice, data) {
    const msg = choice.message || {};
    return { content: msg.content, reasoning_content: null, toolCalls: msg.tool_calls || [], finishReason: choice.finish_reason };
  }
  async chat(request) {
    const res = await fetch(this.buildUrl('/chat/completions'), {
      method: 'POST', headers: this.buildHeaders(), body: JSON.stringify(this.buildRequestBody(request))
    });
    const data = await res.json();
    const choice = data.choices && data.choices[0];
    if (!choice) throw new Error('Empty response');
    return this._buildStandardResponse(choice, data);
  }
  async chatStream(request, onChunk) {
    const res = await fetch(this.buildUrl('/chat/completions'), {
      method: 'POST', headers: { ...this.buildHeaders() }, body: JSON.stringify({ ...this.buildRequestBody(request), stream: true })
    });
    if (!res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    this.abortController = new AbortController();
    const buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const json = line.slice(6).trim();
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
          if (!delta) continue;
          const chunk = {
            content: delta.content || '',
            reasoning_content: null
          };
          if (delta.tool_calls && onChunk) onChunk({ ...chunk, tool_calls: delta.tool_calls });
          else if (onChunk) onChunk(chunk);
        } catch (e) {}
      }
    }
    return null;
  }
  cancel() {
    if (this.abortController) this.abortController.abort();
  }
}