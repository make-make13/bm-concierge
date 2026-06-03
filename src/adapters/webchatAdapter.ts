import { BaseAdapter } from './baseAdapter';
import { conversationService } from '../core/conversationService';
import { config } from '../config';
import { dbStore } from '../core/dbStore';
import crypto from 'crypto';

export class WebchatAdapter extends BaseAdapter {
  constructor() {
    super(config.webchat?.enabled || false); 
  }

  public async start(app?: any): Promise<void> {
    if (!this.isEnabled()) {
      console.log('[WebchatAdapter] disabled by config, public widget not enabled');
    }

    if (!app) {
      console.warn('[WebchatAdapter] Express app is not provided. Cannot register routes.');
      return;
    }

    try {
      console.log('[WebchatAdapter] Registering REST routes...');

      // --- GET /api/chat/web/messages --- polling для виджета ---
      // Возвращает operator-сообщения диалога после заданного cursor (ISO-дата).
      // Публичный endpoint: отдаёт только сообщения того sessionId, что передан.
      app.get('/api/chat/web/messages', (req: any, res: any) => {
        try {
          const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
          if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
          }
          const conversationId = `webchat:${sessionId}`;
          const after = typeof req.query.after === 'string' ? req.query.after.trim() : '';

          const allMessages = (dbStore.getConversationMessages(conversationId) as any[]);
          const operatorMessages = allMessages.filter((m: any) => {
            if (m.role !== 'operator') return false;
            if (!after) return true;
            // Сравниваем строки ISO — SQLite хранит UTC datetime как строку
            return m.created_at > after;
          });

          res.json({
            messages: operatorMessages.map((m: any) => ({
              id: m.id,
              role: m.role,
              text: m.text,
              createdAt: m.created_at ?? null,
            })),
            serverTime: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[WebchatAdapter] Error in polling endpoint:', err);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Пример простого REST API для вебчата
      app.post('/api/chat/web', async (req: any, res: any) => {
        try {
          const { message, guestName, guestContact, pageUrl, referrer } = req.body;
          let { sessionId } = req.body;

          if (!message) {
            return res.status(400).json({ error: 'Message is required' });
          }

          if (!sessionId) {
            sessionId = crypto.randomUUID();
          }

          const externalConversationId = `webchat:${sessionId}`;

          const response = await conversationService.processMessage({
            channel: 'webchat',
            source: 'webchat_ai',
            externalConversationId,
            guestName: guestName || 'Гость сайта',
            guestContact: guestContact || sessionId,
            message,
            raw: { sessionId, pageUrl, referrer }
          });

          // Guard (Pass 4A): в ручном/закрытом режиме ИИ молчит. Не отдаём пустой reply
          // как видимый ответ ИИ: reply=null + aiSkipped=true, чтобы виджет не рисовал пустой «пузырь».
          const aiSkipped = response.aiSkipped === true || !response.reply?.trim();
          return res.json({
            sessionId,
            reply: aiSkipped ? null : response.reply,
            aiSkipped,
            leadCreated: response.leadCreated,
            leadId: response.leadId,
            supabaseStatus: response.supabaseStatus || 'draft',
            conversationId: externalConversationId
          });
        } catch (error) {
          console.error('[WebchatAdapter] Error processing message:', error);
          return res.status(500).json({ error: 'Internal server error' });
        }
      });

    } catch (error) {
      console.error('[WebchatAdapter] Failed to start:', error);
    }
  }

  public stop(): void {
    console.log('[WebchatAdapter] Stopping...');
    // Для REST роутов Express нет простого способа отменить регистрацию (без перехватчика),
    // но можно закрывать соединения WebSocket, если они будут использоваться.
  }
}
