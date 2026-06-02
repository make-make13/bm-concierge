import { Telegraf } from 'telegraf';
import { BaseAdapter } from './baseAdapter';
import { config } from '../config';
import { conversationService } from '../core/conversationService';

export class TelegramAdapter extends BaseAdapter {
  private bot: Telegraf | null = null;
  public status: 'not_configured' | 'running' | 'error' = 'not_configured';

  constructor() {
    super(config.telegram.enabled);
  }

  public async start(): Promise<void> {
    if (!this.isEnabled()) {
      console.log('[TelegramAdapter] disabled by config');
      this.status = 'not_configured';
      return;
    }

    const token = config.telegram.botToken;
    const mode = config.telegram.mode;

    if (!token) {
      console.log('[TelegramAdapter] disabled by config');
      this.status = 'not_configured';
      return;
    }

    console.log(`[TelegramAdapter] enabled, mode=${mode}`);
    console.log(`[TelegramAdapter] token configured=true`);

    try {
      this.bot = new Telegraf(token);

      this.bot.start(async (ctx) => {
        try {
          await ctx.reply('Здравствуйте! Я — онлайн-консьерж бутик-отеля «Большая Медведица». Чем могу помочь?');
        } catch (e) {
          console.error('[TelegramAdapter] Error sending /start reply:', e);
        }
      });

      this.bot.on('text', async (ctx) => {
        const messageText = ctx.message.text;
        const guestName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'Гость Telegram';
        const guestContact = ctx.from.username ? `@${ctx.from.username}` : String(ctx.from.id);
        const externalConversationId = `telegram:${ctx.chat.id}`;

        try {
          // Отправка индикатора набора текста
          await ctx.sendChatAction('typing');

          const result = await conversationService.processMessage({
            channel: 'telegram',
            source: 'telegram_ai',
            externalConversationId,
            guestName,
            guestContact,
            message: messageText
          });

          // Guard (Pass 4A): в ручном/закрытом режиме ИИ молчит — не отправляем пустой ответ
          // и не уходим в catch/fallback. Входящее сообщение уже сохранено в conversationService.
          if (result.aiSkipped || !result.reply?.trim()) {
            return;
          }

          // Отправляем ответ пользователю
          await ctx.reply(result.reply);

        } catch (error) {
          console.error('[TelegramAdapter] Error processing message:', error);
          try {
             await ctx.reply('Извините, произошла техническая ошибка. Пожалуйста, попробуйте позже.');
          } catch (e) {
             console.error('[TelegramAdapter] Cannot send error message:', e);
          }
        }
      });

      const launchBot = (retryCount = 0) => {
        this.bot!.launch().then(() => {
          if (mode === 'polling') {
            console.log('[TelegramAdapter] starting polling');
          }
          console.log('[TelegramAdapter] bot started');
          this.status = 'running';
        }).catch(err => {
          console.log(`[TelegramAdapter] start failed: ${err.message}`);
          this.status = 'error';
          
          if (err.message.includes('409') && retryCount < 10) {
            const delay = Math.min(Math.pow(2, retryCount) * 1000, 30000);
            console.log(`[TelegramAdapter] Retrying in ${delay}ms... (Attempt ${retryCount + 1})`);
            setTimeout(() => launchBot(retryCount + 1), delay);
          }
        });
      };
      
      launchBot();

      // Грациозная остановка
      process.once('SIGINT', () => this.stop());
      process.once('SIGTERM', () => this.stop());
    } catch (error) {
      console.error('[TelegramAdapter] Failed to start:', error);
      this.status = 'error';
    }
  }

  public stop(): void {
    if (this.bot) {
      console.log('[TelegramAdapter] Stopping...');
      this.bot.stop('SIGINT');
      this.status = 'not_configured';
    }
  }
}
