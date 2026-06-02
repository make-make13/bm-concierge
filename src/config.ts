import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const devConfigPath = process.env.SETTINGS_PATH || './data/settings.json';
const fullDevConfigPath = path.resolve(process.cwd(), devConfigPath);

function loadRuntimeConfig() {
  if (fs.existsSync(fullDevConfigPath)) {
    try {
      const data = fs.readFileSync(fullDevConfigPath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse runtime settings:', e);
    }
  }
  return {};
}

let runtimeOverride = loadRuntimeConfig();

// Проверка на то, является ли значение реальным (а не заглушкой, маской или пустым)
export function isValidValue(val: any): boolean {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return false;
    // Игнорируем маски из UI
    if (trimmed.match(/^[\*•]+$/)) return false; // ******** или ••••••••
    if (trimmed === 'configured') return false;
    if (trimmed === 'true' || trimmed === 'false') return true; // Булевы строки ок
    // Игнорируем плейсхолдеры
    if (trimmed.includes('сюда_ключ')) return false;
  }
  return true;
}

/**
 * Получение настройки с приоритетом: 
 * 1. settings.json (Runtime)
 * 2. .env (Bootstrap/Fallback)
 */
function resolveConfig(envKey: string, fallbackEnvs: string[] = [], defaultValue: any = ''): any {
  // 1. Runtime settings (settings.json) имеют наивысший приоритет
  if (isValidValue(runtimeOverride[envKey])) return runtimeOverride[envKey];
  
  for (const fallbackKey of fallbackEnvs) {
    if (isValidValue(runtimeOverride[fallbackKey])) return runtimeOverride[fallbackKey];
  }

  // 2. .env является fallback layer
  if (isValidValue(process.env[envKey])) return process.env[envKey];
  
  for (const fallbackKey of fallbackEnvs) {
    if (isValidValue(process.env[fallbackKey])) return process.env[fallbackKey];
  }

  return defaultValue;
}

export const config = {
  port: process.env.PORT || 3010,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3010',
  devUiEnabled: process.env.DEV_UI_ENABLED === 'true',
  consoleEnabled: process.env.CONSOLE_ENABLED === 'true',
  consoleToken: process.env.CONSOLE_ACCESS_TOKEN || '',
  // Bearer-токен Operator API. Хранится только в env (не в settings.json UI),
  // чтобы секрет не попадал в Console. Пустой = Operator API отключён (не открыт без защиты).
  operatorApiToken: process.env.OPERATOR_API_TOKEN || '',
  dbPath: process.env.DB_PATH || './data/console.db',
  
  supabase: {
    url: resolveConfig('SUPABASE_URL'),
    serviceRoleKey: resolveConfig('SUPABASE_SERVICE_ROLE_KEY'),
    leadsTable: resolveConfig('SUPABASE_LEADS_TABLE', [], 'leads'),
  },
  
  aiProvider: resolveConfig('AI_PROVIDER', [], 'mock'),
  
  openRouter: {
    enabled: resolveConfig('OPENROUTER_ENABLED') === 'true',
    apiKey: resolveConfig('OPENROUTER_API_KEY'),
    baseUrl: resolveConfig('OPENROUTER_BASE_URL', [], 'https://openrouter.ai/api/v1'),
    model: resolveConfig('OPENROUTER_MODEL', ['OPENROUTER_CHAT_MODEL'], 'deepseek/deepseek-chat'),
  },
  
  deepSeek: {
    enabled: resolveConfig('DEEPSEEK_ENABLED') === 'true',
    apiKey: resolveConfig('DEEPSEEK_API_KEY'),
    baseUrl: resolveConfig('DEEPSEEK_BASE_URL', [], 'https://api.deepseek.com'),
    model: resolveConfig('DEEPSEEK_MODEL', [], 'deepseek-chat'),
  },

  smtp: {
    enabled: resolveConfig('SMTP_ENABLED') === 'true',
    host: resolveConfig('SMTP_HOST'),
    port: parseInt(resolveConfig('SMTP_PORT', [], '465')),
    secure: resolveConfig('SMTP_SECURE', [], 'true') === 'true',
    user: resolveConfig('SMTP_USER'),
    password: resolveConfig('SMTP_PASSWORD'),
    fromName: resolveConfig('SMTP_FROM_NAME', [], 'БМ Консьерж'),
    fromEmail: resolveConfig('SMTP_FROM_EMAIL'),
    adminEmail: resolveConfig('ADMIN_NOTIFICATION_EMAIL')
  },
  
  telegram: {
    enabled: resolveConfig('TELEGRAM_ENABLED') === 'true',
    botToken: resolveConfig('TELEGRAM_BOT_TOKEN'),
    botUrl: resolveConfig('TELEGRAM_BOT_URL'),
    adminId: resolveConfig('TELEGRAM_ADMIN_ID'),
    mode: resolveConfig('TELEGRAM_MODE', [], 'polling'),
    webhookUrl: resolveConfig('TELEGRAM_WEBHOOK_URL'),
    webhookSecret: resolveConfig('TELEGRAM_WEBHOOK_SECRET'),
  },
  
  vk: {
    enabled: resolveConfig('VK_ENABLED') === 'true',
    groupToken: resolveConfig('VK_GROUP_TOKEN', ['VK_GROUP_ACCESS_TOKEN']),
    confirmationToken: resolveConfig('VK_CONFIRMATION_TOKEN', ['VK_CONFIRMATION_CODE']),
    secretKey: resolveConfig('VK_SECRET_KEY', ['VK_SECRET_TOKEN']),
  },
  
  webchat: {
    enabled: resolveConfig('WEBCHAT_ENABLED') === 'true',
    allowedOrigins: resolveConfig('WEBCHAT_ALLOWED_ORIGINS', [], 'https://ai.4-am.ru,http://localhost:3010'),
    publicPath: resolveConfig('WEBCHAT_PUBLIC_PATH', [], '/widget.js')
  },
  
  logLevel: process.env.LOG_LEVEL || 'info',
};

export function saveSettings(newSettings: any) {
  const dir = path.dirname(fullDevConfigPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  for (const [key, val] of Object.entries(newSettings)) {
    if (isValidValue(val)) {
      runtimeOverride[key] = val;
    } else if (val === '' || val === null) {
      delete runtimeOverride[key];
    }
  }
  
  fs.writeFileSync(fullDevConfigPath, JSON.stringify(runtimeOverride, null, 2), 'utf8');
  refreshConfig();
}

function refreshConfig() {
  config.supabase.url = resolveConfig('SUPABASE_URL');
  config.supabase.serviceRoleKey = resolveConfig('SUPABASE_SERVICE_ROLE_KEY');
  config.supabase.leadsTable = resolveConfig('SUPABASE_LEADS_TABLE', [], 'leads');
  
  config.aiProvider = resolveConfig('AI_PROVIDER', [], 'mock');
  
  config.openRouter.enabled = resolveConfig('OPENROUTER_ENABLED') === 'true';
  config.openRouter.apiKey = resolveConfig('OPENROUTER_API_KEY');
  config.openRouter.baseUrl = resolveConfig('OPENROUTER_BASE_URL', [], 'https://openrouter.ai/api/v1');
  config.openRouter.model = resolveConfig('OPENROUTER_MODEL', ['OPENROUTER_CHAT_MODEL'], 'deepseek/deepseek-chat');

  config.deepSeek.enabled = resolveConfig('DEEPSEEK_ENABLED') === 'true';
  config.deepSeek.apiKey = resolveConfig('DEEPSEEK_API_KEY');
  config.deepSeek.baseUrl = resolveConfig('DEEPSEEK_BASE_URL', [], 'https://api.deepseek.com');
  config.deepSeek.model = resolveConfig('DEEPSEEK_MODEL', [], 'deepseek-chat');

  config.smtp.enabled = resolveConfig('SMTP_ENABLED') === 'true';
  config.smtp.host = resolveConfig('SMTP_HOST');
  config.smtp.port = parseInt(resolveConfig('SMTP_PORT', [], '465'));
  config.smtp.secure = resolveConfig('SMTP_SECURE', [], 'true') === 'true';
  config.smtp.user = resolveConfig('SMTP_USER');
  config.smtp.password = resolveConfig('SMTP_PASSWORD');
  config.smtp.fromName = resolveConfig('SMTP_FROM_NAME', [], 'БМ Консьерж');
  config.smtp.fromEmail = resolveConfig('SMTP_FROM_EMAIL');
  config.smtp.adminEmail = resolveConfig('ADMIN_NOTIFICATION_EMAIL');

  config.telegram.enabled = resolveConfig('TELEGRAM_ENABLED') === 'true';
  config.telegram.botToken = resolveConfig('TELEGRAM_BOT_TOKEN');
  config.telegram.mode = resolveConfig('TELEGRAM_MODE', [], 'polling');
  config.telegram.webhookUrl = resolveConfig('TELEGRAM_WEBHOOK_URL');

  config.vk.enabled = resolveConfig('VK_ENABLED') === 'true';
  config.vk.groupToken = resolveConfig('VK_GROUP_TOKEN', ['VK_GROUP_ACCESS_TOKEN']);
  config.vk.confirmationToken = resolveConfig('VK_CONFIRMATION_TOKEN', ['VK_CONFIRMATION_CODE']);
  config.vk.secretKey = resolveConfig('VK_SECRET_KEY', ['VK_SECRET_TOKEN']);

  config.webchat.enabled = resolveConfig('WEBCHAT_ENABLED') === 'true';
  config.webchat.allowedOrigins = resolveConfig('WEBCHAT_ALLOWED_ORIGINS', [], 'https://ai.4-am.ru,http://localhost:3010');
}

export const saveDevConfig = saveSettings;
