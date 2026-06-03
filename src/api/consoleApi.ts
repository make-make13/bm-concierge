import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { dbStore } from '../core/dbStore';
import { indexer } from '../rag/indexer';
import { config, saveSettings, isValidValue } from '../config';
import { conversationService } from '../core/conversationService';
import { supabaseWriter } from '../integrations/supabaseLeads';
import { AIProviderFactory } from '../ai/aiProviderFactory';
import { smtpService } from '../integrations/smtpService';
import { telegramAdminNotifier } from '../integrations/telegramAdminNotifier';

export const consoleRouter = Router();

const editableKnowledgeFile = path.join(process.cwd(), 'src', 'knowledge', 'console_kb.md');

function ensureEditableKnowledgeFile() {
  const dir = path.dirname(editableKnowledgeFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(editableKnowledgeFile)) {
    fs.writeFileSync(editableKnowledgeFile, '', 'utf8');
  }
}

function slugifyChunkTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'console_note';
}

type EditableKnowledgeEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  priority: number;
  status: 'active';
  source: 'manual';
  updatedAt: string;
};

function buildKnowledgeChunk(entry: Pick<EditableKnowledgeEntry, 'id' | 'category' | 'title' | 'content' | 'priority'>) {
  return [
    `## CHUNK: ${entry.id}`,
    '',
    `category: ${entry.category || 'custom'}`,
    `title: ${entry.title}`,
    `priority: ${Number.isFinite(entry.priority) ? entry.priority : 5}`,
    '',
    entry.content.trim(),
    ''
  ].join('\n');
}

function parseEditableKnowledge(content: string): EditableKnowledgeEntry[] {
  return content
    .split(/(?:^|\n)## CHUNK:/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const lines = part.split('\n');
      const id = (lines.shift() || '').trim() || `entry-${Date.now()}`;
      let category = 'custom';
      let title = id;
      let priority = 5;
      let bodyStart = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();
        if (lower.startsWith('category:')) {
          category = line.substring(9).trim() || category;
          bodyStart = i + 1;
          continue;
        }
        if (lower.startsWith('title:')) {
          title = line.substring(6).trim() || title;
          bodyStart = i + 1;
          continue;
        }
        if (lower.startsWith('priority:')) {
          const nextPriority = Number(line.substring(9).trim());
          priority = Number.isFinite(nextPriority) ? nextPriority : priority;
          bodyStart = i + 1;
          continue;
        }
        if (line.trim() === '') {
          bodyStart = i + 1;
          break;
        }
        break;
      }

      return {
        id,
        category,
        title,
        content: lines.slice(bodyStart).join('\n').trim(),
        priority,
        status: 'active',
        source: 'manual',
        updatedAt: new Date().toISOString()
      };
    });
}

function readEditableKnowledgeEntries() {
  ensureEditableKnowledgeFile();
  return parseEditableKnowledge(fs.readFileSync(editableKnowledgeFile, 'utf8'));
}

function writeEditableKnowledgeEntries(entries: EditableKnowledgeEntry[]) {
  ensureEditableKnowledgeFile();
  const content = entries.map(buildKnowledgeChunk).join('\n');
  fs.writeFileSync(editableKnowledgeFile, content ? `${content}\n` : '', 'utf8');
  indexer.loadKnowledgeBase();
}

// --- Login endpoint (no auth required) ---
consoleRouter.post('/login', (req: Request, res: Response) => {
  if (!config.consoleEnabled) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { token } = req.body;
  if (!config.consoleToken || token !== config.consoleToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Set httpOnly session cookie valid 8 hours
  res.cookie('console_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({ success: true });
});

// --- Auth Middleware ---
consoleRouter.use((req: Request, res: Response, next) => {
  if (!config.consoleEnabled) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (config.consoleToken) {
    // Accept: httpOnly cookie, X-Console-Token header, or query param
    const cookieToken = parseCookies(req.headers.cookie || '')['console_session'];
    const headerToken = req.headers['x-console-token'] || req.query.token;
    const token = cookieToken || headerToken;
    if (token !== config.consoleToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  next();
});

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
      .filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()])
  );
}

// --- Dashboard ---
consoleRouter.get('/dashboard', (req: Request, res: Response) => {
  const range = (req.query.range as string) || '7';
  const days = range === 'today' ? 1 : parseInt(range) || 7;
  
  const stats = dbStore.getDashboardStats(days);
  const events = dbStore.getEvents(20);
  
  const statusSummary = {
    ai: config.aiProvider,
    telegram: config.telegram.enabled,
    webchat: config.webchat.enabled,
    supabase: !!config.supabase.url,
    smtp: config.smtp.enabled,
    knowledgeBase: indexer.getStatus()
  };

  res.json({
    stats,
    statusSummary,
    events,
    onboarding: {
      aiConfigured: !!(config.openRouter.apiKey || config.deepSeek.apiKey),
      supabaseConfigured: !!config.supabase.url,
      telegramConfigured: config.telegram.enabled && !!config.telegram.botToken,
      webchatConfigured: config.webchat.enabled,
      smtpConfigured: config.smtp.enabled && !!config.smtp.host,
      knowledgeLoaded: indexer.getStatus().totalChunks > 0
    }
  });
});

// --- Settings ---
consoleRouter.get('/settings', (req: Request, res: Response) => {
  const maskedSettings: any = {
    AI_PROVIDER: config.aiProvider,
    OPENROUTER_ENABLED: config.openRouter.enabled,
    OPENROUTER_MODEL: config.openRouter.model,
    OPENROUTER_BASE_URL: config.openRouter.baseUrl,
    OPENROUTER_API_KEY: config.openRouter.apiKey ? 'configured' : '',
    
    DEEPSEEK_ENABLED: config.deepSeek.enabled,
    DEEPSEEK_MODEL: config.deepSeek.model,
    DEEPSEEK_BASE_URL: config.deepSeek.baseUrl,
    DEEPSEEK_API_KEY: config.deepSeek.apiKey ? 'configured' : '',
    
    SMTP_ENABLED: config.smtp.enabled,
    SMTP_HOST: config.smtp.host,
    SMTP_PORT: config.smtp.port,
    SMTP_SECURE: config.smtp.secure,
    SMTP_USER: config.smtp.user,
    SMTP_PASSWORD: config.smtp.password ? 'configured' : '',
    SMTP_FROM_NAME: config.smtp.fromName,
    SMTP_FROM_EMAIL: config.smtp.fromEmail,
    ADMIN_NOTIFICATION_EMAIL: config.smtp.adminEmail,
    
    SUPABASE_URL: config.supabase.url,
    SUPABASE_SERVICE_ROLE_KEY: config.supabase.serviceRoleKey ? 'configured' : '',
    SUPABASE_LEADS_TABLE: config.supabase.leadsTable,

    PUBLIC_BASE_URL: config.publicBaseUrl,

    TELEGRAM_ENABLED: config.telegram.enabled,
    TELEGRAM_BOT_TOKEN: config.telegram.botToken ? 'configured' : '',
    TELEGRAM_ADMIN_ID: config.telegram.adminId,
    TELEGRAM_ADMIN_IDS: config.telegram.adminIds || config.telegram.adminId,
    TELEGRAM_MODE: config.telegram.mode,
    TELEGRAM_WEBHOOK_URL: config.telegram.webhookUrl,

    VK_ENABLED: config.vk.enabled,
    VK_GROUP_TOKEN: config.vk.groupToken ? 'configured' : '',
    VK_CONFIRMATION_TOKEN: config.vk.confirmationToken ? 'configured' : '',
    VK_SECRET_KEY: config.vk.secretKey ? 'configured' : '',

    WEBCHAT_ENABLED: config.webchat.enabled,
    WEBCHAT_ALLOWED_ORIGINS: config.webchat.allowedOrigins,
  };

  res.json(maskedSettings);
});

consoleRouter.post('/settings', (req: Request, res: Response) => {
  const newSettings = req.body;
  saveSettings(newSettings);
  
  supabaseWriter.reinitialize();
  smtpService.reinitialize();
  
  res.json({ success: true });
});

// --- AI Test ---
consoleRouter.post('/ai/test', async (req: Request, res: Response) => {
  const { provider: providerName } = req.body;
  try {
    const provider = AIProviderFactory.getProvider(providerName);
    const result = await provider.testConnection();
    res.json(result);
  } catch (err: any) {
    res.json({ success: false, error: err.message, provider: providerName });
  }
});

// --- SMTP Test ---
consoleRouter.post('/smtp/test', async (req: Request, res: Response) => {
  try {
    const result = await smtpService.testConnection();
    if (result.success) {
      await smtpService.sendEmail({
        to: config.smtp.adminEmail || config.smtp.user,
        subject: 'БМ Консьерж: Тест SMTP',
        text: 'Если вы видите это письмо, значит настройки SMTP верны.'
      });
    }
    res.json(result);
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// --- Telegram Admin Notification Test ---
consoleRouter.post('/telegram/admin-test', async (req: Request, res: Response) => {
  try {
    const result = await telegramAdminNotifier.send([
      '<b>Тест уведомлений BM Concierge</b>',
      '',
      'Если вы видите это сообщение, Telegram ID администратора настроен правильно.',
      `${config.publicBaseUrl}/console`
    ].join('\n'));
    res.json(result);
  } catch (err: any) {
    res.json({ success: false, sent: 0, failed: 0, error: err.message });
  }
});

// --- Conversations ---
consoleRouter.get('/conversations', (req: Request, res: Response) => {
  res.json(dbStore.getConversations());
});

consoleRouter.post('/conversations', (req: Request, res: Response) => {
  const { channel, guest_name, guest_contact } = req.body;
  const id = dbStore.createConversation({ channel, guest_name, guest_contact });
  dbStore.logEvent('CONVERSATION_CREATED', `Новый диалог: ${guest_name}`, { id, channel });
  res.json({ id });
});

consoleRouter.get('/conversations/:id', (req: Request, res: Response) => {
  const conv = dbStore.getConversation(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  res.json(conv);
});

consoleRouter.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const convId = req.params.id;
    const conv = dbStore.getConversation(convId) as any;
    
    if (!conv) return res.status(404).json({ error: 'Not found' });
    
    const result = await conversationService.processMessage({
      channel: conv.channel || 'console',
      source: 'console_test',
      externalConversationId: convId,
      guestName: conv.guest_name,
      guestContact: conv.guest_contact,
      message
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Operator API proxy (console-cookie protected) ---
// Console UI ходит сюда; сервер подставляет OPERATOR_API_TOKEN.
// Токен Operator API НЕ попадает во frontend — остаётся только на сервере.
async function proxyToOperator(req: Request, res: Response, method: string, subPath: string) {
  if (!config.operatorApiToken) {
    return res.status(503).json({ error: { code: 'not_configured', message: 'OPERATOR_API_TOKEN is not set on the server' } });
  }
  try {
    const url = `http://127.0.0.1:${config.port}/api/operator${subPath}`;
    const r = await fetch(url, {
      method,
      headers: { 'Authorization': `Bearer ${config.operatorApiToken}`, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(req.body || {}),
    });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text || '{}');
  } catch (err: any) {
    res.status(502).json({ error: { code: 'proxy_failed', message: err?.message || 'Operator API proxy failed' } });
  }
}

consoleRouter.get('/operator/conversations', (req: Request, res: Response) => {
  const filter = encodeURIComponent(String(req.query.filter || 'all'));
  return proxyToOperator(req, res, 'GET', `/conversations?filter=${filter}&limit=200`);
});
consoleRouter.get('/operator/conversations/:id', (req: Request, res: Response) =>
  proxyToOperator(req, res, 'GET', `/conversations/${encodeURIComponent(req.params.id)}`));
consoleRouter.post('/operator/conversations/:id/take-over', (req: Request, res: Response) =>
  proxyToOperator(req, res, 'POST', `/conversations/${encodeURIComponent(req.params.id)}/take-over`));
consoleRouter.post('/operator/conversations/:id/return-to-ai', (req: Request, res: Response) =>
  proxyToOperator(req, res, 'POST', `/conversations/${encodeURIComponent(req.params.id)}/return-to-ai`));
consoleRouter.post('/operator/conversations/:id/close', (req: Request, res: Response) =>
  proxyToOperator(req, res, 'POST', `/conversations/${encodeURIComponent(req.params.id)}/close`));
consoleRouter.post('/operator/conversations/:id/reply', (req: Request, res: Response) =>
  proxyToOperator(req, res, 'POST', `/conversations/${encodeURIComponent(req.params.id)}/reply`));

// --- Leads ---
consoleRouter.get('/leads', (req: Request, res: Response) => {
  res.json(dbStore.getLeads());
});

consoleRouter.post('/leads/:id/send', async (req: Request, res: Response) => {
  const lead = dbStore.getLead(req.params.id) as any;
  if (!lead) return res.status(404).json({ error: 'Not found' });
  
  const payload = {
    source: lead.source,
    channel: lead.channel,
    guest_name: lead.guest_name,
    guest_contact: lead.guest_contact,
    message: lead.message,
    ai_summary: lead.ai_summary,
    external_conversation_id: lead.conversation_id,
    transcript_json: lead.transcript_json ? JSON.parse(lead.transcript_json) : []
  };

  try {
    const supaId = await supabaseWriter.createLead(payload);
    if (supaId) {
      dbStore.updateLeadSupabaseStatus(lead.id, 'sent', supaId);
      dbStore.logEvent('SUPABASE_SENT', `Заявка ${lead.id} отправлена (повтор)`, { supabaseId: supaId });
      res.json({ success: true, supabaseId: supaId });
    } else {
      res.status(500).json({ error: 'Supabase failed to return ID' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Supabase Test ---
consoleRouter.post('/supabase/test', async (req: Request, res: Response) => {
  try {
    const result = await supabaseWriter.testConnection();
    res.json(result);
  } catch (err: any) {
    res.json({ success: false, error: err.message });
  }
});

// --- Knowledge Base ---
consoleRouter.get('/kb/status', (req: Request, res: Response) => {
  res.json(indexer.getStatus());
});

consoleRouter.get('/kb/editable', (req: Request, res: Response) => {
  try {
    ensureEditableKnowledgeFile();
    const content = fs.readFileSync(editableKnowledgeFile, 'utf8');
    res.json({
      fileName: 'console_kb.md',
      content,
      status: indexer.getStatus()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

consoleRouter.get('/kb/entries', (req: Request, res: Response) => {
  try {
    const category = String(req.query.category || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const allEntries = readEditableKnowledgeEntries();
    let entries = allEntries;

    if (category) entries = entries.filter((entry) => entry.category === category);
    if (search) {
      entries = entries.filter((entry) =>
        `${entry.title}\n${entry.category}\n${entry.content}`.toLowerCase().includes(search)
      );
    }

    const categoryMap = new Map<string, number>();
    allEntries.forEach((entry) => categoryMap.set(entry.category, (categoryMap.get(entry.category) || 0) + 1));
    const categories = Array.from(categoryMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, count]) => ({ id, label: id.replace(/_/g, ' '), count }));

    res.json({ entries, categories, total: entries.length, status: indexer.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

consoleRouter.post('/kb/editable', (req: Request, res: Response) => {
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (content.length > 300000) {
      return res.status(400).json({ error: 'Knowledge content is too large' });
    }
    ensureEditableKnowledgeFile();
    fs.writeFileSync(editableKnowledgeFile, content, 'utf8');
    indexer.loadKnowledgeBase();
    dbStore.logEvent('KB_EDITED', 'База знаний обновлена через Console', { file: 'console_kb.md' });
    res.json({ success: true, status: indexer.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

consoleRouter.post('/kb/chunks', (req: Request, res: Response) => {
  try {
    const category = String(req.body?.category || 'custom').trim();
    const title = String(req.body?.title || '').trim();
    const text = String(req.body?.text || '').trim();
    const priority = Number(req.body?.priority ?? 5);
    if (!title || !text) {
      return res.status(400).json({ error: 'Title and text are required' });
    }
    if (title.length > 160 || text.length > 12000 || category.length > 80) {
      return res.status(400).json({ error: 'Knowledge entry is too large' });
    }

    const entries = readEditableKnowledgeEntries();
    const baseId = slugifyChunkTitle(title);
    let id = baseId;
    let suffix = 2;
    while (entries.some((entry) => entry.id === id)) {
      id = `${baseId}_${suffix++}`;
    }
    entries.unshift({
      id,
      category: category || 'custom',
      title,
      content: text,
      priority: Number.isFinite(priority) ? priority : 5,
      status: 'active',
      source: 'manual',
      updatedAt: new Date().toISOString()
    });
    writeEditableKnowledgeEntries(entries);
    dbStore.logEvent('KB_CHUNK_ADDED', `Добавлена запись базы знаний: ${title}`, { file: 'console_kb.md', category });
    res.json({ success: true, entry: entries[0], status: indexer.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

consoleRouter.put('/kb/entries/:id', (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const category = String(req.body?.category || 'custom').trim();
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || req.body?.text || '').trim();
    const priority = Number(req.body?.priority ?? 5);
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    if (title.length > 160 || content.length > 12000 || category.length > 80) {
      return res.status(400).json({ error: 'Knowledge entry is too large' });
    }

    const entries = readEditableKnowledgeEntries();
    const entryIndex = entries.findIndex((entry) => entry.id === id);
    if (entryIndex < 0) return res.status(404).json({ error: 'Knowledge entry not found' });

    entries[entryIndex] = {
      ...entries[entryIndex],
      category: category || 'custom',
      title,
      content,
      priority: Number.isFinite(priority) ? priority : entries[entryIndex].priority,
      updatedAt: new Date().toISOString()
    };
    writeEditableKnowledgeEntries(entries);
    dbStore.logEvent('KB_CHUNK_UPDATED', `Обновлена запись базы знаний: ${title}`, { file: 'console_kb.md', category });
    res.json({ success: true, entry: entries[entryIndex], status: indexer.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

consoleRouter.delete('/kb/entries/:id', (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim();
    const entries = readEditableKnowledgeEntries();
    const nextEntries = entries.filter((entry) => entry.id !== id);
    if (nextEntries.length === entries.length) return res.status(404).json({ error: 'Knowledge entry not found' });
    writeEditableKnowledgeEntries(nextEntries);
    dbStore.logEvent('KB_CHUNK_DELETED', `Удалена запись базы знаний: ${id}`, { file: 'console_kb.md' });
    res.json({ success: true, status: indexer.getStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

consoleRouter.post('/kb/search', (req: Request, res: Response) => {
  try {
    const query = String(req.body?.query || '').trim().toLowerCase();
    if (!query) return res.json({ matches: [] });
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = indexer.getChunks()
      .map((chunk) => {
        const text = `${chunk.title || ''}\n${chunk.category || ''}\n${chunk.text}`.toLowerCase();
        const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
        return {
          id: chunk.title || chunk.sourceFile,
          title: chunk.title || chunk.sourceFile,
          category: chunk.category || 'knowledge',
          sourceFile: chunk.sourceFile,
          content: chunk.text,
          score
        };
      })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    res.json({ matches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

consoleRouter.post('/kb/reload', async (req: Request, res: Response) => {
  await indexer.loadKnowledgeBase();
  dbStore.logEvent('KB_RELOADED', 'База знаний перезагружена');
  res.json({ success: true, status: indexer.getStatus() });
});

// --- Logs/Events ---
consoleRouter.get('/logs', (req: Request, res: Response) => {
  res.json(dbStore.getEvents(100));
});
