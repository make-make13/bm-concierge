import { AIProvider, AIReply, ConnectionTestResult } from './aiProvider';
import { HandoffManager } from '../core/handoff';

export class MockProvider implements AIProvider {
  public async generateReply(
    input: string, 
    contextChunks: string[], 
    systemPrompt: string,
    history: { role: string, content: string }[] = []
  ): Promise<AIReply> {
    let reply = '';
    
    // Simulate current mock logic
    const lowerInput = input.toLowerCase();
    if (lowerInput.includes('собак') || lowerInput.includes('животн')) {
      reply = 'Понимаю, но с животными у нас нельзя. Запрет действует для любых животных, даже маленьких или в переноске.';
    } else if (lowerInput.includes('где')) {
      reply = 'Мы находимся в селе Териберка.';
    } else if (lowerInput.includes('номер') && lowerInput.includes('июл')) {
      reply = 'У нас есть номера, подходящие под ваш запрос, однако для уточнения доступности на ваши даты и актуальной стоимости мне нужно передать ваш вопрос администратору. Подождите немного, пожалуйста.';
    } else {
      reply = HandoffManager.getFallbackMessage();
    }

    return {
      text: reply,
      provider: 'mock',
      model: 'mock-local',
      confidence: 'medium',
      usedChunks: contextChunks
    };
  }

  public async testConnection(): Promise<ConnectionTestResult> {
    return {
      success: true,
      provider: 'mock',
      model: 'mock-local'
    };
  }
}
