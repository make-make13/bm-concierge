import { getDb } from './db';
import crypto from 'crypto';

function uuid() {
  return crypto.randomUUID();
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
