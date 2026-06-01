import { adapterManager } from '../src/adapters/adapterManager';
import { TelegramAdapter } from '../src/adapters/telegramAdapter';
import { config } from '../src/config';
import { dbStore } from '../src/core/dbStore';
import { initDb } from '../src/core/db';
import { indexer } from '../src/rag/indexer';
import { supabaseWriter } from '../src/integrations/supabaseLeads';

// Mock Supabase to track calls without real network
let supabasePayloads: any[] = [];
supabaseWriter.createLead = async (payload: any) => {
  supabasePayloads.push(payload);
  return 'test-supa-id-123';
};

let sentReplies: string[] = [];

async function runTest() {
  console.log('--- STARTING TELEGRAM ADAPTER TEST ---');
  
  // Prepare App Environment
  process.env.TELEGRAM_ENABLED = 'true';
  process.env.TELEGRAM_BOT_TOKEN = 'fake-token-123';
  process.env.TELEGRAM_MODE = 'polling';
  process.env.TELEGRAM_ADMIN_ID = 'admin123';
  
  // Reload config mock
  config.telegram.enabled = true;
  config.telegram.botToken = 'fake-token-123';
  config.telegram.mode = 'polling';
  config.telegram.adminId = 'admin123';
  
  initDb();
  indexer.loadKnowledgeBase();

  // Test 1: Feature Flag & Config Logging
  console.log('\\n>>> Test 1 & 2: Feature Flags & Config Check');
  const tgAdapter = new TelegramAdapter();
  
  // Override Telegraf to mock callApi
  const originalStart = tgAdapter.start.bind(tgAdapter);
  tgAdapter.start = async () => {
    await originalStart();
    const bot = (tgAdapter as any).bot;
    if (bot) {
      bot.telegram.callApi = async (method: string, payload: any) => {
        if (method === 'sendMessage') {
          sentReplies.push(payload.text);
          return { message_id: 2 };
        }
        if (method === 'getMe') {
          return { id: 111, is_bot: true, username: 'testbot', first_name: 'test' };
        }
        if (method === 'deleteWebhook') return true;
        if (method === 'getUpdates') return [];
        if (method === 'sendChatAction') return true;
        return {};
      };
    }
  };

  await tgAdapter.start();
  console.log(`Telegram Adapter Status: ${tgAdapter.status}`);

  // Helpers to simulate Telegram updates
  const bot = (tgAdapter as any).bot;
  const simulateMessage = async (text: string) => {
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 111, is_bot: false, first_name: 'Test', username: 'testuser' },
        chat: { id: 111, type: 'private' },
        date: Date.now() / 1000,
        text
      }
    });
    // Wait a bit for processing
    await new Promise(r => setTimeout(r, 1000));
  };

  // Test 4a: /start
  console.log('\\n>>> Test 4a: /start');
  sentReplies = [];
  await simulateMessage('/start');
  console.log('Bot Reply:', sentReplies[0]);
  
  // Test 4b: "Можно ли с собакой?"
  console.log('\\n>>> Test 4b: Можно ли с собакой?');
  sentReplies = [];
  supabasePayloads = [];
  await simulateMessage('Можно ли с собакой?');
  console.log('Bot Reply:', sentReplies[0]);
  console.log('Leads sent to Supabase:', supabasePayloads.length);

  // Test 4c: "Какой пароль от Wi-Fi?"
  // Note: KB doesn't have Wi-Fi password in the facts provided in prompt (only "Wi-Fi is available"), so it might say fallback or just "доступен".
  console.log('\\n>>> Test 4c: Какой пароль от Wi-Fi?');
  sentReplies = [];
  supabasePayloads = [];
  await simulateMessage('Какой пароль от Wi-Fi?');
  console.log('Bot Reply:', sentReplies[0]);
  console.log('Leads sent to Supabase:', supabasePayloads.length);

  // Test 4d: Booking Request
  console.log('\\n>>> Test 4d: Booking request');
  sentReplies = [];
  supabasePayloads = [];
  await simulateMessage('Хотим номер на двоих с видом на море с 15 по 18 июля');
  console.log('Bot Reply:', sentReplies[0]);
  console.log('Leads sent to Supabase:', supabasePayloads.length);
  
  if (supabasePayloads.length > 0) {
    const payload = supabasePayloads[0];
    console.log('\\n>>> Test 5 & 6: Source, Channel, Conversation ID');
    console.log(`source: ${payload.source}`);
    console.log(`channel: ${payload.channel}`);
    console.log(`external_conversation_id: ${payload.external_conversation_id}`);
    
    console.log('\\n>>> Test 7: Transcript JSON');
    console.log(JSON.stringify(payload.transcript_json, null, 2));
  }

  console.log('\\n>>> Test 8: Duplicate Check');
  const localLeads = dbStore.getLeads();
  console.log(`Local leads created: ${localLeads.length}`);
  console.log(`Supabase leads created: ${supabasePayloads.length}`);

  console.log('\\n>>> Test 9: Error Resilience');
  // Check what happens if API fails (we can simulate by throwing an error in callApi)
  bot.telegram.callApi = async () => { throw new Error('Simulated network error'); };
  await simulateMessage('Test error handling');
  console.log(`Adapter status after error: ${tgAdapter.status}`);
  
  tgAdapter.stop();
  console.log('--- TEST COMPLETE ---');
  process.exit(0);
}

runTest().catch(console.error);
