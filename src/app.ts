import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { healthCheck } from './api/health';
import { testChatHandler } from './api/testChat';
import { indexer } from './rag/indexer';
import { devRouter } from './api/dev';
import { consoleRouter } from './api/consoleApi';
import { operatorRouter } from './api/operatorApi';
import { initDb } from './core/db';
import { dbStore } from './core/dbStore';
import { adapterManager } from './adapters/adapterManager';

const app = express();

// Middleware
const allowedOriginsStr = config.webchat.allowedOrigins || '*';
const allowedOrigins = allowedOriginsStr.split(',').map((s: string) => s.trim());

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOriginsStr === '*') return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS error: origin not allowed'));
    }
  }
}));
app.use(express.json());

// Routes
app.get('/health', healthCheck);
app.post('/api/chat/test', testChatHandler);

if (config.devUiEnabled) {
  console.log('DEV UI is enabled. Routes available at /dev');
  app.use('/api/dev', devRouter);
  app.use('/dev', express.static(path.join(process.cwd(), 'src/dev-ui')));
}

if (config.consoleEnabled) {
  console.log('CONSOLE is enabled. Routes available at /console');
  app.use('/api/console', consoleRouter);

  // Login page — always public
  app.get('/console/login', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'src/console-ui/login.html'));
  });

  // Auth guard for console UI
  const consoleAuthGuard = (req: any, res: any, next: any) => {
    if (!config.consoleToken) return next();
    const cookies = parseCookiesStr(req.headers.cookie || '');
    if (cookies['console_session'] === config.consoleToken) return next();
    const next_ = encodeURIComponent(req.originalUrl);
    res.redirect(`/console/login?next=${next_}`);
  };

  app.get('/console', consoleAuthGuard, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'src/console-ui/index.html'));
  });

  app.use('/console', consoleAuthGuard, express.static(path.join(process.cwd(), 'src/console-ui'), { redirect: false }));
}

function parseCookiesStr(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
      .filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()])
  );
}

// Operator API (read-only, Bearer-auth). Независим от Console cookie-auth.
// Активен только если задан OPERATOR_API_TOKEN (иначе сам отдаёт 503 not_configured).
app.use('/api/operator', operatorRouter);
console.log('Operator API mounted at /api/operator (Bearer-auth, read-only)');

if (config.webchat.enabled) {
  console.log('[WebchatAdapter] enabled, serving public folder');
  app.use(express.static(path.join(process.cwd(), 'public')));
}

// Initialize application
const start = () => {
  // Init DB
  if (config.consoleEnabled) {
    initDb();
    dbStore.logEvent('SYSTEM_START', 'Бэкенд запущен');
  }

  // Load knowledge base
  indexer.loadKnowledgeBase();

  // Start messaging adapters
  adapterManager.startAll(app);

  app.listen(config.port, () => {
    console.log(`BM Concierge Backend is running on port ${config.port}`);
  });
};

start();
