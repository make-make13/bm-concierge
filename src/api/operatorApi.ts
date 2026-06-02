import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { dbStore, normalizeConversationStatus } from '../core/dbStore';
import { indexer } from '../rag/indexer';

/**
 * Operator API (Pass 2 — READ ONLY).
 * Отдельный Bearer-авторизованный контур для веб-дашборда и вкладки «ИИ-консьерж» в CRM.
 * Не использует Console cookie-auth. Никаких мутаций данных в Pass 2.
 */
export const operatorRouter = Router();

// --- Единый JSON-формат ошибок ---
function sendError(res: Response, httpStatus: number, code: string, message: string) {
  res.status(httpStatus).json({ error: { code, message } });
}

const DB_NOT_READY = 'Database not initialized';

/**
 * Выполняет read-only обращение к БД. Если локальная БД не инициализирована
 * (CONSOLE_ENABLED=false), отдаёт JSON 503 вместо HTML-ошибки Express.
 * Возвращает undefined, если ответ уже отправлен.
 */
function withDb<T>(res: Response, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (err: any) {
    if (String(err?.message || '').includes(DB_NOT_READY)) {
      sendError(res, 503, 'service_unavailable', 'Local DB is not initialized. Set CONSOLE_ENABLED=true.');
      return undefined;
    }
    throw err;
  }
}

// --- Bearer-авторизация (не Console cookie) ---
operatorRouter.use((req: Request, res: Response, next: NextFunction) => {
  // Токен не сконфигурирован → API закрыт (никогда не открываем без защиты).
  if (!config.operatorApiToken) {
    return sendError(res, 503, 'not_configured', 'OPERATOR_API_TOKEN is not set. Operator API is disabled.');
  }

  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header);
  const token = match ? match[1].trim() : '';

  if (!token || token !== config.operatorApiToken) {
    return sendError(res, 401, 'unauthorized', 'Missing or invalid Bearer token.');
  }

  next();
});

// --- Helpers маппинга строк БД → camelCase контракт ---
function toBool(v: unknown): boolean {
  return v === 1 || v === true || v === '1';
}

function mapConversationSummary(row: any) {
  return {
    id: row.id,
    channel: row.channel ?? null,
    guestName: row.guest_name ?? null,
    guestContact: row.guest_contact ?? null,
    status: normalizeConversationStatus(row.status),
    manualMode: toBool(row.manual_mode),
    needsAttention: toBool(row.needs_attention),
    escalationReason: row.escalation_reason ?? null,
    assignedTo: row.assigned_to ?? null,
    lastMessagePreview: row.last_message_preview ?? null,
    lastMessageAt: row.last_message_at ?? row.updated_at ?? null,
    linkedLeadId: row.linked_lead_id ?? null,
  };
}

/** Полный объект диалога (как для GET /conversations/:id), используется и в POST-мутациях. */
function mapConversationDetail(conv: any) {
  return {
    id: conv.id,
    channel: conv.channel ?? null,
    guestName: conv.guest_name ?? null,
    guestContact: conv.guest_contact ?? null,
    status: normalizeConversationStatus(conv.status),
    manualMode: toBool(conv.manual_mode),
    needsAttention: toBool(conv.needs_attention),
    escalationReason: conv.escalation_reason ?? null,
    assignedTo: conv.assigned_to ?? null,
    aiSummary: conv.ai_summary ?? null,
    linkedLeadId: conv.linked_lead_id ?? null,
    createdAt: conv.created_at ?? null,
    lastMessageAt: conv.last_message_at ?? conv.updated_at ?? null,
    messages: (conv.messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      createdAt: m.created_at ?? null,
    })),
    lead: conv.lead ?? null,
  };
}

/**
 * Загружает диалог с обработкой ошибок. Если БД не готова → 503 (через withDb),
 * если диалог не найден → 404. В обоих случаях ответ уже отправлен и возвращается undefined.
 */
function fetchConversationOrRespond(res: Response, id: string): any | undefined {
  const conv = withDb(res, () => dbStore.getConversation(id) as any);
  if (conv === undefined) return undefined; // 503 уже отправлен
  if (!conv) {
    sendError(res, 404, 'not_found', 'Conversation not found');
    return undefined;
  }
  return conv;
}

// --- GET /api/operator/status ---
operatorRouter.get('/status', (req: Request, res: Response) => {
  let counts = { open: 0, needsAttention: 0, operator: 0 };
  try {
    counts = dbStore.getConversationCounts();
  } catch {
    // БД может быть не инициализирована — отдаём безопасные нули, статус остаётся доступным.
  }

  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    aiProvider: config.aiProvider,
    uptimeSec: Math.floor(process.uptime()),
    counts,
  });
});

// --- GET /api/operator/stats ---
operatorRouter.get('/stats', (req: Request, res: Response) => {
  const range = (req.query.range as string) || '7';
  const days = range === 'today' ? 1 : parseInt(range, 10) || 7;

  try {
    const stats = dbStore.getDashboardStats(days) as any;
    const counts = dbStore.getConversationCounts();
    res.json({ range, ...stats, needsAttention: counts.needsAttention });
  } catch (err: any) {
    if (String(err?.message || '').includes(DB_NOT_READY)) {
      return sendError(res, 503, 'service_unavailable', 'Local DB is not initialized. Set CONSOLE_ENABLED=true.');
    }
    sendError(res, 500, 'internal_error', err?.message || 'Failed to load stats');
  }
});

// --- GET /api/operator/channels (статусы выводятся из конфигурации) ---
operatorRouter.get('/channels', (req: Request, res: Response) => {
  const channelStatus = (enabled: boolean) => (enabled ? 'running' : 'not_configured');
  res.json({
    channels: [
      { id: 'telegram', enabled: config.telegram.enabled, status: channelStatus(config.telegram.enabled), canSend: false },
      { id: 'vk', enabled: config.vk.enabled, status: channelStatus(config.vk.enabled), canSend: false },
      { id: 'webchat', enabled: config.webchat.enabled, status: channelStatus(config.webchat.enabled), canSend: false },
    ],
  });
});

// --- GET /api/operator/conversations ---
operatorRouter.get('/conversations', (req: Request, res: Response) => {
  const allowedFilters = ['all', 'needs_attention', 'operator', 'open'];
  const filter = allowedFilters.includes(req.query.filter as string) ? (req.query.filter as string) : 'all';
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  const result = withDb(res, () => {
    const rows = dbStore.operatorListConversations({ filter, limit, offset }) as any[];
    const total = dbStore.operatorCountConversations(filter);
    return { rows, total };
  });
  if (!result) return; // 503 уже отправлен

  res.json({
    items: result.rows.map(mapConversationSummary),
    total: result.total,
  });
});

// --- GET /api/operator/conversations/:id ---
operatorRouter.get('/conversations/:id', (req: Request, res: Response) => {
  const conv = fetchConversationOrRespond(res, req.params.id);
  if (!conv) return; // 503/404 уже отправлены
  res.json(mapConversationDetail(conv));
});

// --- POST /api/operator/conversations/:id/take-over ---
// Перевод диалога в ручной режим оператора. Идемпотентно.
operatorRouter.post('/conversations/:id/take-over', (req: Request, res: Response) => {
  try {
    const conv = fetchConversationOrRespond(res, req.params.id);
    if (!conv) return;
    if (normalizeConversationStatus(conv.status) === 'closed') {
      return sendError(res, 409, 'conversation_closed', 'Cannot take over a closed conversation');
    }
    const raw = req.body && typeof req.body.assignedTo === 'string' ? req.body.assignedTo.trim() : '';
    const assignedTo = raw || 'admin';
    dbStore.setConversationManualMode(req.params.id, true, assignedTo);
    res.json(mapConversationDetail(dbStore.getConversation(req.params.id)));
  } catch (err: any) {
    sendError(res, 500, 'internal_error', err?.message || 'take-over failed');
  }
});

// --- POST /api/operator/conversations/:id/return-to-ai ---
// Возврат диалога ИИ. Закрытый диалог не оживляем (нет reopen endpoint) → 409.
operatorRouter.post('/conversations/:id/return-to-ai', (req: Request, res: Response) => {
  try {
    const conv = fetchConversationOrRespond(res, req.params.id);
    if (!conv) return;
    if (normalizeConversationStatus(conv.status) === 'closed') {
      return sendError(res, 409, 'conversation_closed', 'Cannot return a closed conversation to AI');
    }
    dbStore.setConversationManualMode(req.params.id, false);
    res.json(mapConversationDetail(dbStore.getConversation(req.params.id)));
  } catch (err: any) {
    sendError(res, 500, 'internal_error', err?.message || 'return-to-ai failed');
  }
});

// --- POST /api/operator/conversations/:id/close ---
// Закрытие диалога. После этого ИИ не отвечает (guard в conversationService). Идемпотентно.
operatorRouter.post('/conversations/:id/close', (req: Request, res: Response) => {
  try {
    const conv = fetchConversationOrRespond(res, req.params.id);
    if (!conv) return;
    dbStore.setConversationStatus(req.params.id, 'closed');
    res.json(mapConversationDetail(dbStore.getConversation(req.params.id)));
  } catch (err: any) {
    sendError(res, 500, 'internal_error', err?.message || 'close failed');
  }
});

// --- GET /api/operator/knowledge/status ---
operatorRouter.get('/knowledge/status', (req: Request, res: Response) => {
  res.json(indexer.getStatus());
});

// --- Catch-all: неизвестный operator-путь → JSON 404 (не HTML Express) ---
operatorRouter.use((req: Request, res: Response) => {
  sendError(res, 404, 'not_found', 'Unknown operator endpoint');
});
