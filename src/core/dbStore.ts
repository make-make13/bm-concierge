import { getDb } from './db';
import crypto from 'crypto';

function uuid() {
  return crypto.randomUUID();
}

/**
 * Допустимые статусы диалога (Operator API / ручной режим, Pass 1).
 * Старый статус 'open' оставлен в БД совместимым и на чтении трактуется как 'ai'
 * через normalizeConversationStatus().
 */
export const CONVERSATION_STATUSES = [
  'ai',
  'needs_attention',
  'operator',
  'lead_created',
  'closed',
  'error',
] as const;

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Допустимые роли сообщений. 'operator' — ручной ответ администратора. */
export const MESSAGE_ROLES = ['guest', 'assistant', 'operator'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** Сырая строка conversations (snake_case, как в SQLite). */
export interface ConversationRow {
  id: string;
  channel: string;
  guest_name: string;
  guest_contact: string;
  status: string;
  manual_mode: number;
  needs_attention: number;
  escalation_reason: string | null;
  assigned_to: string | null;
  linked_lead_id: string | null;
  ai_summary: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Сырая строка messages (snake_case, как в SQLite). */
export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  text: string;
  raw_json: string | null;
  created_at: string;
}

/** Нормализует статус для чтения: legacy 'open'/пусто → 'ai'. */
export function normalizeConversationStatus(status?: string | null): ConversationStatus {
  if (!status || status === 'open') return 'ai';
  return (CONVERSATION_STATUSES as readonly string[]).includes(status)
    ? (status as ConversationStatus)
    : 'ai';
}

export const dbStore = {
  // --- Conversations ---
  getConversations() {
    return getDb().prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
  },

  getConversation(id: string) {
    const conv = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!conv) return null;
    const messages = getDb().prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
    const lead = getDb().prepare('SELECT * FROM leads WHERE conversation_id = ?').get(id);
    return { ...conv, messages, lead };
  },

  createConversation(data: { id?: string; channel: string; guest_name: string; guest_contact: string }) {
    const id = data.id || uuid();
    getDb().prepare(`
      INSERT INTO conversations (id, channel, guest_name, guest_contact)
      VALUES (?, ?, ?, ?)
    `).run(id, data.channel, data.guest_name, data.guest_contact);
    return id;
  },

  updateConversationStatus(id: string, status: string) {
    getDb().prepare('UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);
  },

  // --- Conversations: Operator API helpers (Pass 1) ---

  /**
   * Список диалогов с опциональной фильтрацией.
   * filter: 'all' (по умолчанию) | 'needs_attention' | 'operator' | 'open'/'ai'.
   */
  listConversations(opts: { filter?: string; limit?: number; offset?: number } = {}) {
    const { filter = 'all', limit = 50, offset = 0 } = opts;
    let where = '';
    if (filter === 'needs_attention') {
      where = 'WHERE needs_attention = 1';
    } else if (filter === 'operator') {
      where = "WHERE status = 'operator' OR manual_mode = 1";
    } else if (filter === 'open' || filter === 'ai') {
      where = "WHERE status IN ('ai', 'open') OR status IS NULL";
    }
    return getDb()
      .prepare(`SELECT * FROM conversations ${where} ORDER BY COALESCE(last_message_at, updated_at) DESC LIMIT ? OFFSET ?`)
      .all(limit, offset);
  },

  /** Сообщения диалога в хронологическом порядке (без вложенной выборки lead/conversation). */
  getConversationMessages(id: string) {
    return getDb().prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
  },

  /** Включить/выключить ручной режим оператора. При включении выставляет status='operator' и снимает needs_attention. */
  setConversationManualMode(id: string, enabled: boolean, assignedTo?: string) {
    if (enabled) {
      getDb()
        .prepare(
          "UPDATE conversations SET manual_mode = 1, status = 'operator', needs_attention = 0, assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(assignedTo ?? null, id);
    } else {
      getDb()
        .prepare(
          "UPDATE conversations SET manual_mode = 0, status = 'ai', needs_attention = 0, assigned_to = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(id);
    }
  },

  /** Пометить диалог как требующий администратора (или снять пометку при reason=null). */
  setConversationNeedsAttention(id: string, reason?: string | null) {
    const needs = reason === null ? 0 : 1;
    const newReason = reason === null ? null : reason ?? null;
    if (needs) {
      getDb()
        .prepare(
          "UPDATE conversations SET needs_attention = 1, escalation_reason = ?, status = CASE WHEN status IN ('operator','closed','lead_created') THEN status ELSE 'needs_attention' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        )
        .run(newReason, id);
    } else {
      getDb()
        .prepare('UPDATE conversations SET needs_attention = 0, escalation_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(id);
    }
  },

  /** Установить статус диалога (валидируется по CONVERSATION_STATUSES). */
  setConversationStatus(id: string, status: ConversationStatus) {
    const safe: ConversationStatus = (CONVERSATION_STATUSES as readonly string[]).includes(status) ? status : 'ai';
    getDb().prepare('UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(safe, id);
  },

  /** Привязать локальный lead к диалогу и пометить status='lead_created'. */
  setConversationLinkedLead(id: string, leadId: string) {
    getDb()
      .prepare("UPDATE conversations SET linked_lead_id = ?, status = 'lead_created', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(leadId, id);
  },

  /** Обновить краткое AI-резюме диалога. */
  updateConversationAiSummary(id: string, summary: string) {
    getDb().prepare('UPDATE conversations SET ai_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(summary, id);
  },

  /** Обновить отметку времени последнего сообщения. */
  touchConversationLastMessage(id: string) {
    getDb()
      .prepare('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(id);
  },

  // --- Messages ---
  addMessage(conversation_id: string, role: string, text: string, raw_json?: string) {
    const id = uuid();
    getDb().prepare(`
      INSERT INTO messages (id, conversation_id, role, text, raw_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, conversation_id, role, text, raw_json || null);
    
    getDb().prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(conversation_id);
    return id;
  },

  // --- Leads ---
  getLeads() {
    return getDb().prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  },

  getLead(id: string) {
    return getDb().prepare('SELECT * FROM leads WHERE id = ?').get(id);
  },

  createLead(data: {
    conversation_id?: string;
    source: string;
    channel: string;
    guest_name: string;
    guest_contact: string;
    message: string;
    ai_summary: string;
    transcript_json: string;
  }) {
    const id = uuid();
    getDb().prepare(`
      INSERT INTO leads (id, conversation_id, source, channel, guest_name, guest_contact, message, ai_summary, transcript_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.conversation_id || null, data.source, data.channel, data.guest_name, data.guest_contact, 
      data.message, data.ai_summary, data.transcript_json
    );
    return id;
  },

  updateLeadSupabaseStatus(id: string, status: string, supabase_id?: string, error_message?: string) {
    getDb().prepare(`
      UPDATE leads 
      SET supabase_status = ?, supabase_id = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(status, supabase_id || null, error_message || null, id);
  },

  // --- Events ---
  getEvents(limit = 100) {
    return getDb().prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT ?').all(limit);
  },

  logEvent(type: string, message: string, payload?: any) {
    try {
      const id = uuid();
      getDb().prepare(`
        INSERT INTO events (id, type, message, payload_json)
        VALUES (?, ?, ?, ?)
      `).run(id, type, message, payload ? JSON.stringify(payload) : null);
    } catch (err) {
      console.error('Failed to log event to DB:', err);
    }
  },

  // --- Stats ---
  getDashboardStats(days = 7) {
    const dateLimit = days === 1 
      ? "date('now')" 
      : "date('now', '-" + days + " days')";

    const totalMessages = getDb().prepare("SELECT count(*) as count FROM messages WHERE created_at >= " + dateLimit).get() as any;
    const totalLeads = getDb().prepare("SELECT count(*) as count FROM leads WHERE created_at >= " + dateLimit).get() as any;
    const supabaseSent = getDb().prepare("SELECT count(*) as count FROM leads WHERE supabase_status = 'sent' AND created_at >= " + dateLimit).get() as any;
    const supabaseErrors = getDb().prepare("SELECT count(*) as count FROM leads WHERE supabase_status = 'error' AND created_at >= " + dateLimit).get() as any;
    const activeGuests = getDb().prepare("SELECT count(DISTINCT id) as count FROM conversations WHERE updated_at >= " + dateLimit).get() as any;

    return {
      totalMessages: totalMessages.count,
      totalLeads: totalLeads.count,
      supabaseSent: supabaseSent.count,
      supabaseErrors: supabaseErrors.count,
      activeGuests: activeGuests.count,
      autonomyRate: 100 // Default
    };
  }
};
