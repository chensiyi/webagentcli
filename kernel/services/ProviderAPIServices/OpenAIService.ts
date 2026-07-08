import { BaseProviderAPIService } from '../IProviderAPIService.js';
import { Log } from '../Log.js';
import { MessageStructure } from '../../models/MessageContent.js';

export default class OpenAIService extends BaseProviderAPIService {
  constructor() { super(); this.name = 'openai'; }

  buildUrl(path: string) {
    const base = (this.config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
    return `${base}${path}`;
  }
  buildHeaders(request?: any): Record<string, string> {
    // 委托父类构建基础头 + 合并 request.headers
    return super.buildHeaders(request);
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
  _buildStandardResponse(choice: any, data: any) {
    const msg = choice.message || {};
    return {
      content: msg.content || '',
      reasoning_content: msg.reasoning_content || null,
      toolCalls: MessageStructure.parseToolCallsFromOpenAI(msg.tool_calls || []),
      finishReason: choice.finish_reason || null,
      usage: data.usage || null,
      model: data.model || null,
    };
  }
  async chat(request: any) {
    const url = this.buildUrl('/chat/completions');
    const body = this.buildRequestBody(request);
    Log.info('OpenAIService', `Chat request: model=${body.model}, messages=${body.messages?.length}`);

    try {
      const res = await fetch(url, {
        method: 'POST', headers: this.buildHeaders(request), body: JSON.stringify(body)
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
      if ((error).name !== 'AbortError') {
        Log.error('OpenAIService', 'Chat failed:', error);
      }
      throw error;
    }
  }
  async chatStream(request: any, onChunk?: (chunk: any) => void): Promise<any> {
    const url = this.buildUrl('/chat/completions');
    const body: Record<string, any> = { ...this.buildRequestBody(request), stream: true };
    Log.info('OpenAIService', `Stream request: model=${body.model}, messages=${body.messages?.length}`);

    const pendingToolCalls: Record<number, any> = {};
    let pendingContent = '';
    let pendingReasoning = '';
    let pendingFinishReason: string | null = null;

    try {
      const res = await fetch(url, {
        method: 'POST', headers: { ...this.buildHeaders(request) }, body: JSON.stringify(body)
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
            const choice = parsed.choices && parsed.choices[0];
            if (!choice) continue;
            const delta = choice.delta || {};
            if (choice.finish_reason) pendingFinishReason = choice.finish_reason;

            // 累积 tool_calls（流式分片合并）
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!pendingToolCalls[tc.index]) {
                  pendingToolCalls[tc.index] = tc;
                } else {
                  const existing = pendingToolCalls[tc.index];
                  if (tc.function) {
                    existing.function = existing.function || { name: '', arguments: '' };
                    existing.function.name = existing.function.name || tc.function.name || '';
                    existing.function.arguments = (existing.function.arguments || '') + (tc.function.arguments || '');
                  }
                }
              }
            }

            totalChunkCount++;
            const contentChunk = delta.content || '';
            const reasoningChunk = delta.reasoning_content || delta.reasoning || '';
            if (contentChunk) pendingContent += contentChunk;
            if (reasoningChunk) pendingReasoning += reasoningChunk;
            if (onChunk) onChunk({ content: contentChunk, reasoning_content: reasoningChunk });
          } catch (e) {
            Log.warn('OpenAIService', 'Failed to parse SSE chunk:', e);
          }
        }
      }

      Log.info('OpenAIService', `Stream completed: ${totalChunkCount} chunks, toolCalls=${Object.keys(pendingToolCalls).length}`);
      return {
        content: pendingContent,
        reasoning_content: pendingReasoning,
        toolCalls: MessageStructure.parseToolCallsFromOpenAI(Object.values(pendingToolCalls)),
        finishReason: pendingFinishReason || 'stop',
        usage: null,
        model: null
      };
    } catch (error) {
      if ((error).name === 'AbortError') {
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
