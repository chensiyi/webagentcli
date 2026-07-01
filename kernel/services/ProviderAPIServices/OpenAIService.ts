import { BaseProviderAPIService } from '../IProviderAPIService.js';
import { Log } from '../Log.js';

export default class OpenAIService extends BaseProviderAPIService {
  constructor() { super(); this.name = 'openai'; }

  buildUrl(path) {
    const base = (this.config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
    return `${base}${path}`;
  }
  buildHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` };
  }
  buildRequestBody(request: Record<string, any>): Record<string, any> {
    return {
      model: request.model || this.config.model,
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
    const url = this.buildUrl('/chat/completions');
    const body = this.buildRequestBody(request);
    Log.info('OpenAIService', `Chat request: model=${body.model}, messages=${body.messages?.length}`);

    try {
      const res = await fetch(url, {
        method: 'POST', headers: this.buildHeaders(), body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '(no body)');
        Log.error('OpenAIService', `Chat HTTP ${res.status}: ${errText.substring(0, 200)}`);
        throw new Error(`OpenAI API error: ${res.status} - ${errText.substring(0, 200)}`);
      }
      const data = await res.json();
      const choice = data.choices && data.choices[0];
      if (!choice) {
        Log.error('OpenAIService', 'Chat response empty: no choices');
        throw new Error('Empty response');
      }
      Log.info('OpenAIService', `Chat response received: finishReason=${choice.finish_reason}`);
      return this._buildStandardResponse(choice, data);
    } catch (error) {
      if (error.name !== 'AbortError') {
        Log.error('OpenAIService', 'Chat failed:', error);
      }
      throw error;
    }
  }
  async chatStream(request, onChunk) {
    const url = this.buildUrl('/chat/completions');
    const body = { ...this.buildRequestBody(request), stream: true };
    Log.info('OpenAIService', `Stream request: model=${body.model}, messages=${body.messages?.length}`);

    try {
      const res = await fetch(url, {
        method: 'POST', headers: { ...this.buildHeaders() }, body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '(no body)');
        Log.error('OpenAIService', `Stream HTTP ${res.status}: ${errText.substring(0, 200)}`);
        throw new Error(`OpenAI API error: ${res.status} - ${errText.substring(0, 200)}`);
      }
      if (!res.body) {
        Log.warn('OpenAIService', 'Stream response has no body');
        return null;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      this.abortController = new AbortController();
      let totalChunkCount = 0;
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
            totalChunkCount++;
            const chunk = {
              content: delta.content || '',
              reasoning_content: null
            };
            if (delta.tool_calls && onChunk) onChunk({ ...chunk, tool_calls: delta.tool_calls });
            else if (onChunk) onChunk(chunk);
          } catch (e) {
            Log.warn('OpenAIService', 'Failed to parse SSE chunk:', e);
          }
        }
      }
      Log.info('OpenAIService', `Stream completed: ${totalChunkCount} chunks`);
      return null;
    } catch (error) {
      if (error.name === 'AbortError') {
        Log.info('OpenAIService', 'Stream cancelled');
        return null;
      }
      Log.error('OpenAIService', 'Stream failed:', error);
      throw error;
    }
  }
  cancel() {
    if (this.abortController) {
      Log.info('OpenAIService', 'Request cancelled by user');
      this.abortController.abort();
    }
  }
}
export { OpenAIService };
