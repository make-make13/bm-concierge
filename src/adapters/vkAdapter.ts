import { BaseAdapter } from './baseAdapter';
import { config } from '../config';
import { conversationService } from '../core/conversationService';
import fetch from 'node-fetch';

const VK_API_VERSION = '5.199';

export class VkAdapter extends BaseAdapter {
  constructor() {
    super(config.vk.enabled);
  }

  public async start(app?: any): Promise<void> {
    if (!this.isEnabled()) {
      console.log('[VkAdapter] disabled by config');
      return;
    }

    if (!app) {
      console.warn('[VkAdapter] Express app not provided, cannot register webhook');
      return;
    }

    const token = config.vk.groupToken;
    const confirmationToken = config.vk.confirmationToken;
    const secretKey = config.vk.secretKey;

    if (!token || !confirmationToken) {
      console.error('[VkAdapter] groupToken or confirmationToken missing, cannot start');
      return;
    }

    console.log('[VkAdapter] Registering webhook at /webhooks/vk');

    app.post('/webhooks/vk', async (req: any, res: any) => {
      try {
        const body = req.body;

        // Подтверждение сервера VK. ВАЖНО: VK НЕ присылает поле secret в confirmation-запросе,
        // поэтому проверку секрета делаем ПОСЛЕ — иначе подтверждение упирается в 403.
        if (body.type === 'confirmation') {
          return res.send(confirmationToken);
        }

        // Проверка секрета (если настроен) — для реальных событий
        if (secretKey && body.secret !== secretKey) {
          console.warn('[VkAdapter] Invalid secret key in request');
          return res.status(403).send('forbidden');
        }

        // VK ждёт немедленный ответ 'ok'
        res.send('ok');

        if (body.type === 'message_new') {
          const msg = body.object?.message;
          if (!msg) return;

          const peerId: number = msg.peer_id;
          const fromId: number = msg.from_id;
          const text: string = (msg.text || '').trim();

          // Игнорируем пустые и служебные сообщения
          if (!text) return;

          const externalConversationId = `vk:${peerId}`;

          // Получаем имя пользователя через VK API
          let guestName = `VK пользователь ${fromId}`;
          try {
            const userInfo = await this.getVkUserName(fromId, token);
            if (userInfo) guestName = userInfo;
          } catch (e) {
            // не критично
          }

          const guestContact = `https://vk.com/id${fromId}`;

          const result = await conversationService.processMessage({
            channel: 'vk',
            source: 'vk_ai',
            externalConversationId,
            guestName,
            guestContact,
            message: text,
            raw: { peerId, fromId, msgId: msg.id }
          });

          // Guard (Pass 4A): в ручном/закрытом режиме ИИ молчит — не вызываем messages.send
          // с пустым текстом и не считаем это ошибкой доставки. Входящее уже сохранено.
          if (result.aiSkipped || !result.reply?.trim()) {
            return;
          }

          // Отправляем ответ в VK
          await this.sendVkMessage(peerId, result.reply, token);
        }
      } catch (err) {
        console.error('[VkAdapter] Error handling webhook:', err);
        // res уже отправлен выше
      }
    });

    console.log('[VkAdapter] started, listening at /webhooks/vk');
  }

  private async getVkUserName(userId: number, token: string): Promise<string | null> {
    const url = `https://api.vk.com/method/users.get?user_ids=${userId}&access_token=${token}&v=${VK_API_VERSION}`;
    const resp = await fetch(url);
    const data: any = await resp.json();
    if (data.response && data.response[0]) {
      const u = data.response[0];
      return [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
    }
    return null;
  }

  private async sendVkMessage(peerId: number, message: string, token: string): Promise<void> {
    const randomId = Math.floor(Math.random() * 1e9);
    const url = new URL('https://api.vk.com/method/messages.send');
    url.searchParams.set('peer_id', String(peerId));
    url.searchParams.set('message', message);
    url.searchParams.set('random_id', String(randomId));
    url.searchParams.set('access_token', token);
    url.searchParams.set('v', VK_API_VERSION);

    const resp = await fetch(url.toString(), { method: 'POST' });
    const data: any = await resp.json();
    if (data.error) {
      console.error('[VkAdapter] VK API error:', data.error);
      throw new Error(`VK API error ${data.error.error_code ?? ''}: ${data.error.error_msg ?? JSON.stringify(data.error)}`);
    }
  }

  /**
   * Отправка сообщения в существующий VK-чат через группу (Pass VK-reply).
   * Используется Operator API для ручного ответа администратора.
   * Токен берётся из конфига (тот же источник, что и при запуске адаптера).
   */
  public async sendMessage(peerId: string | number, text: string): Promise<void> {
    if (!this.isEnabled()) {
      throw new Error('VK adapter is not enabled (VK_ENABLED=false)');
    }
    const token = config.vk.groupToken;
    if (!token) {
      throw new Error('VK group token is not configured');
    }
    if (!text || !text.trim()) {
      throw new Error('Cannot send empty VK message');
    }
    await this.sendVkMessage(Number(peerId), text, token);
  }

  public stop(): void {
    console.log('[VkAdapter] stopped');
  }
}
