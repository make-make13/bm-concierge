import Database from 'better-sqlite3';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

export function initDb() {
  if (!config.consoleEnabled) return;
  if (db) return;

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      channel TEXT,
      guest_name TEXT,
      guest_contact TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      role TEXT,
      text TEXT,
      raw_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      source TEXT,
      channel TEXT,
      guest_name TEXT,
      guest_contact TEXT,
      message TEXT,
      ai_summary TEXT,
      transcript_json TEXT,
      supabase_status TEXT DEFAULT 'draft',
      supabase_id TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT,
      message TEXT,
      payload_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Idempotent migrations for Operator API / manual operator mode (Pass 1).
  ensureConversationColumns(db);
}

/**
 * Безопасно добавляет недостающие колонки в `conversations` через ALTER TABLE ADD COLUMN.
 * Идемпотентно: проверяет PRAGMA table_info, не пересоздаёт таблицу, не трогает данные
 * и существующие колонки. Каждое добавление можно выполнять повторно без ошибок.
 */
function ensureConversationColumns(database: Database.Database) {
  const columns = (database.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>)
    .map((c) => c.name);

  // Новые колонки и их DDL. last_message_at — без DEFAULT CURRENT_TIMESTAMP:
  // SQLite запрещает непостоянный DEFAULT в ALTER TABLE ADD COLUMN.
  const additions: Array<{ name: string; ddl: string }> = [
    { name: 'manual_mode', ddl: 'manual_mode INTEGER DEFAULT 0' },
    { name: 'needs_attention', ddl: 'needs_attention INTEGER DEFAULT 0' },
    { name: 'escalation_reason', ddl: 'escalation_reason TEXT' },
    { name: 'assigned_to', ddl: 'assigned_to TEXT' },
    { name: 'linked_lead_id', ddl: 'linked_lead_id TEXT' },
    { name: 'ai_summary', ddl: 'ai_summary TEXT' },
    { name: 'last_message_at', ddl: 'last_message_at DATETIME' },
  ];

  for (const { name, ddl } of additions) {
    if (!columns.includes(name)) {
      database.exec(`ALTER TABLE conversations ADD COLUMN ${ddl}`);
    }
  }

  // Безопасный backfill last_message_at из updated_at (если обе колонки доступны).
  const columnsAfter = (database.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>)
    .map((c) => c.name);
  if (columnsAfter.includes('last_message_at') && columnsAfter.includes('updated_at')) {
    database.exec('UPDATE conversations SET last_message_at = updated_at WHERE last_message_at IS NULL');
  }
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Ensure consoleEnabled is true and initDb() was called.');
  }
  return db;
}
