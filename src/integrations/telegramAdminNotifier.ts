import { config } from '../config';
import { dbStore } from '../core/dbStore';

function parseAdminIds(value: string): string[] {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatChannel(channel: string) {
  const labels: Record<string, string> = {
    telegram: 'Telegram',
    webchat: 'Сайт',
    vk: 'VK',
    console: 'Console',
    test: 'Тест',
  };
  return labels[channel] || channel;
}

function formatEscalationReason(reason: string) {
  const labels: Record<string, string> = {
    guest_requested: 'гость просит администратора',
    discount: 'скидка или индивидуальные условия',
    complaint: 'жалоба или конфликт',
    admin_decision: 'вопрос требует решения администратора',
    low_confidence: 'низкая уверенность ИИ',
    no_kb: 'нет точной информации в базе знаний',
  };
  return labels[reason] || reason;
}

export function shouldNotifyEscalation(conversation: any): boolean {
  if (!conversation) return true;
  return !(conversation.needs_attention === 1 || conversation.needs_attention === true);
}

export function formatTelegramSendError(chatId: string, status: number, description?: string) {
  const base = `${chatId}: HTTP ${status}${description ? ` - ${description}` : ''}`;
  const normalized = String(description || '').toLowerCase();
  if (status === 403 || (status === 400 && normalized.includes('chat not found'))) {
    return `${base}. Администратор должен открыть нового бота и нажать /start; если ошибка останется, проверьте Telegram ID.`;
  }
  return base;
}

export function formatEscalationNotification(data: {
  conversationId: string;
  channel: string;
  guestName: string;
  guestContact: string;
  message: string;
  reason: string;
  consoleUrl?: string;
}) {
  const consoleUrl = data.consoleUrl || `${config.publicBaseUrl}/console`;
  return [
    '<b>Нужен администратор</b>',
    '',
    `Гость: <b>${escapeHtml(data.guestName || 'Гость')}</b>`,
    `Канал: ${escapeHtml(formatChannel(data.channel))}`,
    `Причина: ${escapeHtml(formatEscalationReason(data.reason))}`,
    `Контакт: ${escapeHtml(data.guestContact || '-')}`,
    '',
    '<b>Последнее сообщение:</b>',
    escapeHtml(data.message),
    '',
    '<b>Открыть Console:</b>',
    consoleUrl,
    '',
    `<code>${escapeHtml(data.conversationId)}</code>`,
  ].join('\n');
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
          const body: any = await response.json().catch(() => ({}));
          errors.push(formatTelegramSendError(chatId, response.status, body.description));
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
    const text = formatEscalationNotification(data);
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
