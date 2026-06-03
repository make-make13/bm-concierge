import { dbStore, normalizeConversationStatus } from './dbStore';
import { detectEscalation } from './escalation';
import { conciergeEngine } from './conciergeEngine';
import { LeadExtractor } from './leadExtractor';
import { supabaseWriter } from '../integrations/supabaseLeads';
import { smtpService } from '../integrations/smtpService';
import { telegramAdminNotifier } from '../integrations/telegramAdminNotifier';
import { config } from '../config';

export type IncomingChannelMessage = {
  channel: 'console' | 'telegram' | 'webchat' | 'vk' | 'test';
  source: string;
  externalConversationId: string;
  guestName?: string;
  guestContact?: string;
  message: string;
  raw?: unknown;
};

export type ConversationServiceResult = {
  reply: string;
  conversationId: string;
  leadCreated: boolean;
  leadId?: string | null;
  supabaseStatus?: 'draft' | 'sending' | 'sent' | 'error';
  metadata?: unknown;
  /** true, если ИИ не отвечал из-за ручного режима/закрытого диалога (Pass 3). */
  aiSkipped?: boolean;
};

export class ConversationService {
  public async processMessage(input: IncomingChannelMessage): Promise<ConversationServiceResult> {
    const { channel, source, externalConversationId, guestName = 'Гость', guestContact = '', message } = input;

    // 1. Получаем или создаем диалог в локальной БД
    let conv = dbStore.getConversation(externalConversationId);
    if (!conv) {
      dbStore.createConversation({
        id: externalConversationId,
        channel,
        guest_name: guestName,
        guest_contact: guestContact
      });
      conv = dbStore.getConversation(externalConversationId);
    }

    // 2. Сохраняем сообщение пользователя (всегда, даже в ручном/закрытом режиме — не теряем входящие)
    dbStore.addMessage(externalConversationId, 'guest', message);

    // 2.1 GUARD ручного режима/закрытого диалога (Pass 3).
    // Читаем СВЕЖЕЕ состояние после сохранения входящего и ПЕРЕД генерацией ответа (анти-гонка):
    // оператор мог взять диалог или закрыть его между сообщениями.
    const stateConv = dbStore.getConversation(externalConversationId) as any;
    const isManual = stateConv ? (stateConv.manual_mode === 1 || stateConv.manual_mode === true) : false;
    const isClosed = stateConv ? normalizeConversationStatus(stateConv.status) === 'closed' : false;
    if (isManual || isClosed) {
      // ИИ не вызывается, ответ в канал не генерируется, авто-заявка не создаётся.
      dbStore.logEvent(
        isClosed ? 'AI_SKIPPED_CLOSED' : 'AI_SKIPPED_MANUAL_MODE',
        `ИИ не отвечает (${isClosed ? 'closed' : 'manual'}) в диалоге ${externalConversationId}`,
        { convId: externalConversationId, channel }
      );
      return {
        reply: '',
        conversationId: externalConversationId,
        leadCreated: false,
        leadId: null,
        supabaseStatus: 'draft',
        aiSkipped: true,
      };
    }

    // 3. Анализируем интенты
    const isLead = LeadExtractor.isPotentialLead(message);

    // 4. Генерируем ответ через ИИ
    const currentConv = dbStore.getConversation(externalConversationId);
    let history: { role: string, content: string }[] = [];
    if (currentConv && currentConv.messages.length > 1) {
       // Берем последние 10, исключая последнее (так как оно уже в `message`)
       const pastMessages = currentConv.messages.slice(-11, -1);
       history = pastMessages.map((msg: any) => ({
         role: msg.role === 'guest' ? 'user' : 'assistant',
         content: msg.text
       }));
    }

    const aiReply = await conciergeEngine.generateReply(message, history, guestName);
    const replyText = aiReply.text;

    // 5. Сохраняем ответ ИИ
    dbStore.addMessage(externalConversationId, 'assistant', replyText, JSON.stringify({ aiProvider: config.aiProvider }));

    // 5.1 Авто-эскалация (Pass 5): помечаем диалог как «нужен администратор», но ИИ НЕ глушим.
    // Сюда мы попадаем только при manual_mode=0 и status != closed (guard выше уже отсёк остальное).
    try {
      const escalation = detectEscalation(message, aiReply);
      if (escalation.needsAttention && escalation.reason) {
        const fresh = dbStore.getConversation(externalConversationId) as any;
        const freshStatus = fresh ? normalizeConversationStatus(fresh.status) : 'ai';
        const isManualNow = fresh ? (fresh.manual_mode === 1 || fresh.manual_mode === true) : false;
        // Не трогаем диалоги, которые уже ведёт оператор или закрытые (анти-гонка).
        if (!isManualNow && freshStatus !== 'operator' && freshStatus !== 'closed') {
          const already = fresh && fresh.needs_attention === 1 && fresh.escalation_reason === escalation.reason;
          dbStore.setConversationNeedsAttention(externalConversationId, escalation.reason);
          if (!already) {
            dbStore.logEvent(
              'CONVERSATION_ESCALATED',
              `Диалог ${externalConversationId} требует администратора: ${escalation.reason}`,
              { convId: externalConversationId, reason: escalation.reason, channel }
            );
            telegramAdminNotifier.notifyEscalation({
              conversationId: externalConversationId,
              channel,
              guestName,
              guestContact,
              message,
              reason: escalation.reason
            }).catch((err) => console.error('Failed to notify Telegram admins:', err));
          }
        }
      }
    } catch (escErr) {
      console.error('Escalation detection failed:', escErr);
    }

    let leadCreated = false;
    let localLeadId: string | null = null;
    let supabaseStatus: 'draft' | 'sending' | 'sent' | 'error' = 'draft';

    // 6. Если заявка обнаружена, сохраняем локально и отправляем в Supabase / SMTP
    if (isLead) {
      const summary = LeadExtractor.generateSummary(message);
      
      const updatedConv = dbStore.getConversation(externalConversationId);
      const history = updatedConv ? updatedConv.messages : [];
      const transcriptJson = history.map((msg: any) => ({
        role: msg.role,
        text: msg.text
      }));

      // Сохранение локальной заявки
      localLeadId = dbStore.createLead({
        conversation_id: externalConversationId,
        source,
        channel,
        guest_name: guestName,
        guest_contact: guestContact,
        message,
        ai_summary: summary,
        transcript_json: JSON.stringify(transcriptJson)
      });

      leadCreated = true;
      dbStore.logEvent('LEAD_CREATED', `Создана заявка из ${channel} от ${guestName}`, { leadId: localLeadId, convId: externalConversationId });

      // 7. Отправка в Supabase
      supabaseStatus = 'sending';
      try {
        const supaId = await supabaseWriter.createLead({
          source,
          channel,
          guest_name: guestName,
          guest_contact: guestContact,
          message,
          ai_summary: summary,
          external_conversation_id: externalConversationId,
          transcript_json: transcriptJson
        });

        if (supaId) {
          supabaseStatus = 'sent';
          dbStore.updateLeadSupabaseStatus(localLeadId as string, 'sent', supaId);
          dbStore.logEvent('SUPABASE_SENT', `Заявка ${localLeadId} отправлена`, { supabaseId: supaId });
        } else {
          supabaseStatus = 'error';
          dbStore.updateLeadSupabaseStatus(localLeadId as string, 'error', undefined, 'Supabase returned empty ID');
        }
      } catch (err: any) {
        supabaseStatus = 'error';
        dbStore.updateLeadSupabaseStatus(localLeadId as string, 'error', undefined, err.message);
      }

      // 8. Уведомление через SMTP (в фоновом режиме, не блокируем ответ пользователю)
      if (config.smtp.enabled && config.smtp.adminEmail) {
        this.notifyAdminByEmail({
          id: localLeadId as string,
          source,
          channel,
          guestName,
          guestContact,
          message,
          summary,
          supabaseStatus
        }).catch(err => console.error('Failed to notify admin by email:', err));
      }
      telegramAdminNotifier.notifyLead({
        id: localLeadId as string,
        source,
        channel,
        guestName,
        guestContact,
        message,
        summary,
        supabaseStatus
      }).catch(err => console.error('Failed to notify Telegram admins:', err));
    }

    return {
      reply: replyText,
      conversationId: externalConversationId,
      leadCreated,
      leadId: localLeadId,
      supabaseStatus
    };
  }

  private async notifyAdminByEmail(data: any) {
    const consoleUrl = `${config.publicBaseUrl}/console`;
    
    const subject = `Новая заявка: ${data.guestName} (${data.channel})`;
    const text = `
Новая заявка получена!

Источник: ${data.source}
Канал: ${data.channel}
Гость: ${data.guestName}
Контакт: ${data.guestContact}

Сообщение:
${data.message}

AI Резюме:
${data.summary}

Статус Supabase: ${data.supabaseStatus}

Посмотреть в панели управления:
${consoleUrl}
`;

    await smtpService.sendEmail({
      to: config.smtp.adminEmail,
      subject,
      text
    });
    
    dbStore.logEvent('SMTP_SENT', `Уведомление о заявке ${data.id} отправлено админу`);
  }
}

export const conversationService = new ConversationService();
