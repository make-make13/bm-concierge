import { Router, Request, Response } from 'express';
import { dbStore } from '../core/dbStore';
import { indexer } from '../rag/indexer';
import { config, saveSettings, isValidValue } from '../config';
import { conversationService } from '../core/conversationService';
import { supabaseWriter } from '../integrations/supabaseLeads';
import { AIProviderFactory } from '../ai/aiProviderFactory';
import { smtpService } from '../integrations/smtpService';

export const consoleRouter = Router();

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

consoleRouter.post('/kb/reload', async (req: Request, res: Response) => {
  await indexer.loadKnowledgeBase();
  dbStore.logEvent('KB_RELOADED', 'База знаний перезагружена');
  res.json({ success: true, status: indexer.getStatus() });
});

// --- Logs/Events ---
consoleRouter.get('/logs', (req: Request, res: Response) => {
  res.json(dbStore.getEvents(100));
});
