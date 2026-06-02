import { AIProvider, AIReply, ConnectionTestResult } from './aiProvider';
import fetch from 'node-fetch';
import { config } from '../config';

export class DeepSeekProvider implements AIProvider {
  private get apiKey() { return config.deepSeek.apiKey; }
  private get baseUrl() { return (config.deepSeek.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, ''); }
  private get model() { return config.deepSeek.model || 'deepseek-chat'; }

  constructor() {}

  public async generateReply(
    input: string, 
    contextChunks: string[], 
    systemPrompt: string,
    history: { role: string, content: string }[] = []
  ): Promise<AIReply> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is missing');
    }

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (contextChunks.length > 0) {
      messages.push({
        role: 'system',
        content: `Контекст из базы знаний:\n\n${contextChunks.join('\n\n')}`
      });
    }

    if (history && history.length > 0) {
      messages.push(...history);
    }

    messages.push({ role: 'user', content: input });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: 0.3,
        }),
        signal: controller.signal as any
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errText = await response.text();
        if (response.status === 401) throw new Error('DeepSeek API: Неверный API ключ (401)');
        if (response.status === 429) throw new Error('DeepSeek API: Слишком много запросов (429)');
        if (response.status >= 500) throw new Error(`DeepSeek API: Ошибка сервера (${response.status})`);
        throw new Error(`DeepSeek API error: ${response.status} ${errText}`);
      }

      const data = await response.json();
      const replyText = data.choices?.[0]?.message?.content?.trim() || '';
      
      if (!replyText) {
        throw new Error('DeepSeek API вернул пустой ответ.');
      }

      return {
        text: replyText,
        provider: 'deepseek',
        model: this.model,
        usedChunks: contextChunks
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('DeepSeek API: Превышено время ожидания (Timeout)');
      }
      throw new Error(`Failed to generate reply via DeepSeek: ${err.message}`);
    }
  }

  public async testConnection(): Promise<ConnectionTestResult> {
    if (!this.apiKey) {
      return { success: false, error: 'DeepSeek API key is missing', provider: 'deepseek', model: this.model };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'Test ping' }],
          max_tokens: 5
        }),
        signal: controller.signal as any
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errText = await response.text();
        if (response.status === 401) return { success: false, error: 'Неверный API ключ (401)', provider: 'deepseek', model: this.model };
        if (response.status === 429) return { success: false, error: 'Слишком много запросов (429)', provider: 'deepseek', model: this.model };
        return { success: false, error: `API error: ${response.status} ${errText}`, provider: 'deepseek', model: this.model };
      }

      return { success: true, provider: 'deepseek', model: this.model };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Превышено время ожидания (Timeout)', provider: 'deepseek', model: this.model };
      }
      return { success: false, error: err.message, provider: 'deepseek', model: this.model };
    }
  }
}
