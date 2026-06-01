import { dbStore } from '../src/core/dbStore';
import { initDb, getDb } from '../src/core/db';
import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config';

async function verify() {
  initDb();
  const db = getDb();

  console.log('--- 1. CONVERSATIONS ---');
  const convs = db.prepare(`SELECT * FROM conversations WHERE channel = 'telegram' ORDER BY created_at DESC`).all() as any[];
  console.log(`Found ${convs.length} telegram conversations`);
  if (convs.length > 0) {
    const c = convs[0];
    console.log(`Latest ID: ${c.id}`);
    console.log(`Matches telegram:<chat_id> format: ${c.id.startsWith('telegram:')}`);
    
    console.log('\\n--- 2. MESSAGES ---');
    const msgs = db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`).all(c.id) as any[];
    console.log(`Found ${msgs.length} messages for this conversation`);
    msgs.forEach(m => console.log(`  [${m.role}]: ${m.text.substring(0, 50)}...`));

    console.log('\\n--- 3. LOCAL LEADS ---');
    const leads = db.prepare(`SELECT * FROM leads WHERE conversation_id = ? ORDER BY created_at DESC`).all(c.id) as any[];
    console.log(`Found ${leads.length} leads for this conversation`);
    if (leads.length > 0) {
      const l = leads[0];
      console.log(`Lead ID: ${l.id}`);
      console.log(`Source: ${l.source}`);
      console.log(`Channel: ${l.channel}`);
      console.log(`Supabase Status: ${l.supabase_status}`);
      console.log(`Supabase ID: ${l.supabase_id}`);

      console.log('\\n--- 4. SUPABASE LEADS ---');
      if (config.supabase.url && config.supabase.serviceRoleKey) {
        const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
        const { data, error } = await supabase
          .from(config.supabase.leadsTable)
          .select('*')
          .eq('id', l.supabase_id)
          .single();
          
        if (error) {
          console.error('Error fetching from Supabase:', error.message);
        } else if (data) {
          console.log(`Supabase Lead ID: ${data.id}`);
          console.log(`Status: ${data.status}`);
          console.log(`Pulled to CRM: ${data.pulled_to_crm}`);
          console.log(`Source: ${data.source}`);
          console.log(`Channel: ${data.channel}`);
          console.log(`Phone: ${data.phone ? 'Filled' : 'Empty'}`);
          console.log(`Consent: ${data.consent_accepted}`);
          console.log(`AI Summary length: ${data.ai_summary?.length}`);
          console.log(`Transcript chunks: ${data.transcript_json ? data.transcript_json.length : 0}`);
        }
      } else {
        console.log('Supabase credentials not configured in .env');
      }
    }
  }

  console.log('\\n--- 5. EVENT LEAKS CHECK ---');
  const events = db.prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT 50`).all() as any[];
  const tokenRegex = /\\d{9,10}:[A-Za-z0-9_-]{35,}/;
  const leaks = events.filter(e => tokenRegex.test(e.message) || (e.payload_json && tokenRegex.test(e.payload_json)));
  console.log(`Found ${leaks.length} token leaks in recent events`);
}

verify().catch(console.error);
