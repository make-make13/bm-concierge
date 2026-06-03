import { config } from '../config';
import { dbStore } from '../core/dbStore';

function parseAdminIds(value: string): string[] {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

class TelegramAdminNotifier {
  public getAdminIds() {
    return parseAdminIds(config.telegram.adminIds || config.telegram.adminId || '');
  }

  public isConfigured() {
    return Boolean(config.telegram.botToken && this.getAdminIds().length > 0);
  }

  public async send(text: string) {
    if (!this.isConfigured()) {
      return { success: false, sent: 0, failed: 0, error: 'Telegram admin notifications are not configured' };
    }

    const ids = this.getAdminIds();
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const chatId of ids) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        });

        if (!response.ok) {
          failed++;
          errors.push(`${chatId}: HTTP ${response.status}`);
          continue;
        }
        sent++;
      } catch (err: any) {
        failed++;
        errors.push(`${chatId}: ${err?.message || 'send failed'}`);
      }
    }

    return { success: sent > 0 && failed === 0, sent, failed, error: errors.join('; ') || undefined };
  }

  public async notifyLead(data: {
    id: string;
    source: string;
    channel: string;
    guestName: string;
    guestContact: string;
    message: string;
    summary: string;
    supabaseStatus: string;
  }) {
    const text = [
      '<b>Новая заявка</b>',
      '',
      `Источник: ${escapeHtml(data.source)}`,
      `Канал: ${escapeHtml(data.channel)}`,
      `Гость: ${escapeHtml(data.guestName)}`,
      `Контакт: ${escapeHtml(data.guestContact || '-')}`,
      '',
      '<b>Сообщение:</b>',
      escapeHtml(data.message),
      '',
      '<b>AI резюме:</b>',
      escapeHtml(data.summary),
      '',
      `Supabase: ${escapeHtml(data.supabaseStatus)}`,
      `${config.publicBaseUrl}/console`
    ].join('\n');

    const result = await this.send(text);
    dbStore.logEvent(
      result.sent > 0 ? 'TELEGRAM_ADMIN_SENT' : 'TELEGRAM_ADMIN_FAILED',
      result.sent > 0 ? `Telegram-уведомление о заявке ${data.id} отправлено администраторам` : `Не удалось отправить Telegram-уведомление о заявке ${data.id}`,
      { leadId: data.id, sent: result.sent, failed: result.failed, error: result.error }
    );
    return result;
  }

  public async notifyEscalation(data: {
    conversationId: string;
    channel: string;
    guestName: string;
    guestContact: string;
    message: string;
    reason: string;
  }) {
    const text = [
      '<b>Нужен администратор</b>',
      '',
      `Диалог: ${escapeHtml(data.conversationId)}`,
      `Канал: ${escapeHtml(data.channel)}`,
      `Гость: ${escapeHtml(data.guestName)}`,
      `Контакт: ${escapeHtml(data.guestContact || '-')}`,
      `Причина: ${escapeHtml(data.reason)}`,
      '',
      '<b>Последнее сообщение:</b>',
      escapeHtml(data.message),
      '',
      `${config.publicBaseUrl}/console`
    ].join('\n');

    const result = await this.send(text);
    dbStore.logEvent(
      result.sent > 0 ? 'TELEGRAM_ADMIN_SENT' : 'TELEGRAM_ADMIN_FAILED',
      result.sent > 0 ? `Telegram-уведомление по диалогу ${data.conversationId} отправлено администраторам` : `Не удалось отправить Telegram-уведомление по диалогу ${data.conversationId}`,
      { convId: data.conversationId, reason: data.reason, sent: result.sent, failed: result.failed, error: result.error }
    );
    return result;
  }
}

export const telegramAdminNotifier = new TelegramAdminNotifier();
