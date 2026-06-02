import { searchEngine } from '../rag/search';
import { AIProviderFactory } from '../ai/aiProviderFactory';

const SYSTEM_PROMPT = `Ты — онлайн-консьерж бутик-отеля «Большая Медведица» в Териберке.
Отвечай приветливо и по-человечески.
Отвечай только на основе переданных фрагментов базы знаний.
Если точной информации нет — не придумывай, предложи уточнить у администратора.
Не подтверждай бронирование, не обещай наличие номеров и не называй цены.
Если гость хочет забронировать номер (например, спрашивает про даты, вид на море, цену), отвечай примерно так:
"Понял вас. Передам заявку администратору: он проверит наличие номера на эти даты, возможность нужного размещения и актуальную стоимость. Бронь считается подтверждённой только после ответа от бутик-отеля."
Не используй WhatsApp.
Не публикуй приватные контакты администратора.`;

export class ConciergeEngine {
  public async generateReply(message: string, history: { role: string, content: string }[] = [], guestName: string = 'Гость'): Promise<any> {
    const contextStr = searchEngine.search(message);
    const contextChunks = contextStr ? [contextStr] : [];
    
    const provider = AIProviderFactory.getProvider();
    
    if (contextChunks.length === 0) {
      return {
        text: 'Я не хочу подсказать неточно. Лучше передам вопрос администратору.',
        provider: 'system-fallback',
        model: 'none',
        confidence: 'low',
        usedChunks: []
      };
    }

    // Динамически добавляем обращение по имени, если применимо
    const dynamicPrompt = SYSTEM_PROMPT + `\nИмя текущего гостя: ${guestName}. Если уместно, обращайся по имени.`;

    try {
      return await provider.generateReply(message, contextChunks, dynamicPrompt, history);
    } catch (err: any) {
      console.error('AI Provider Error:', err);
      return {
        text: 'Извините, возникла техническая ошибка. Передаю запрос администратору.',
        provider: 'error',
        model: 'unknown'
      };
    }
  }
}

export const conciergeEngine = new ConciergeEngine();
