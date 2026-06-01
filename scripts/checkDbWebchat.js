const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/console.db');
const db = new Database(dbPath);

console.log("=== Conversations ===");
const conversations = db.prepare("SELECT * FROM conversations WHERE external_conversation_id LIKE 'webchat:%'").all();
console.log(conversations);

console.log("\\n=== Messages ===");
const messages = db.prepare("SELECT * FROM messages WHERE conversation_id = ?").all(conversations[0]?.id);
console.log(messages.map(m => `[${m.role}] ${m.content}`));

console.log("\\n=== Leads ===");
const leads = db.prepare("SELECT * FROM leads WHERE source = 'webchat_ai'").all();
console.log(leads);
