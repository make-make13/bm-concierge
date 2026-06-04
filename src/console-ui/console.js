let currentView = 'dashboard';
let currentConversationId = null;
let settings = {};

// --- Navigation ---
function navTo(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + viewId).classList.remove('hidden');
  
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  const menuItems = Array.from(document.querySelectorAll('.menu-item'));
  const activeMenu = menuItems.find(m => {
    const attr = m.getAttribute('onclick') || '';
    return attr.includes("'" + viewId + "'");
  });
  if (activeMenu) activeMenu.classList.add('active');
  
  currentView = viewId;
  
  if (viewId === 'dashboard') loadDashboard();
  if (viewId === 'conversations') loadConversations();
  if (viewId === 'leads') loadLeads();
  if (viewId === 'kb') loadKBStatus();
  if (viewId === 'logs') loadLogs();
  if (viewId === 'settings' || viewId === 'ai-providers' || viewId === 'integrations' || viewId === 'hotel-profile') loadSettings();
}

// Ensure navTo is available globally for inline onclick
window.navTo = navTo;

// --- API Helper ---
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('console_token') || '';
  const headers = {
    'Content-Type': 'application/json',
    'X-Console-Token': token,
    ...options.headers
  };
  
  const res = await fetch('/api/console' + path, { ...options, headers });
  if (res.status === 401) {
    const promptToken = prompt('Введите токен доступа к консоли:');
    if (promptToken) {
      localStorage.setItem('console_token', promptToken);
      return apiFetch(path, options);
    }
  }
  return res.json();
}

// --- Dashboard ---
async function loadDashboard() {
  const range = document.getElementById('dash-range').value;
  const data = await apiFetch('/dashboard?range=' + range);
  
  if (data.stats) {
    document.getElementById('stat-total-messages').textContent = data.stats.totalMessages;
    document.getElementById('stat-autonomy').textContent = data.stats.autonomyRate + '%';
    document.getElementById('stat-leads').textContent = data.stats.totalLeads;
    document.getElementById('stat-errors').textContent = data.stats.supabaseErrors;
    
    document.getElementById('badge-leads').textContent = data.stats.totalLeads;
    document.getElementById('badge-errors').textContent = data.stats.supabaseErrors;
  }
  
  // Events
  const eventsList = document.getElementById('dash-events');
  if (data.events) {
    eventsList.innerHTML = data.events.map(e => `
      <div class="event-item">
        <div class="event-dot ${e.type.includes('ERROR') || e.type.includes('FAILED') ? 'red' : 'blue'}"></div>
        <div class="event-content">
          <div class="event-msg">${e.message}</div>
          <div class="event-time">${new Date(e.created_at).toLocaleString()}</div>
        </div>
      </div>
    `).join('') || '<div class="empty empty-rich"><b>Событий за период нет</b><span>Ошибок и новых системных событий не найдено. Можно проверить каналы или открыть центр проверки.</span></div>';
  }
  
  // Status
  const statusBox = document.getElementById('dash-status');
  const s = data.statusSummary;
  if (s) {
    statusBox.innerHTML = `
      <div class="status-line">
        <span>AI Провайдер</span>
        <span class="status-badge active">${s.ai.toUpperCase()}</span>
      </div>
      <div class="status-line">
        <span>Telegram</span>
        <span class="status-badge ${s.telegram ? 'active' : ''}">${s.telegram ? 'ВКЛ' : 'ВЫКЛ'}</span>
      </div>
      <div class="status-line">
        <span>WebChat</span>
        <span class="status-badge ${s.webchat ? 'active' : ''}">${s.webchat ? 'ВКЛ' : 'ВЫКЛ'}</span>
      </div>
      <div class="status-line">
        <span>Supabase</span>
        <span class="status-badge ${s.supabase ? 'active' : ''}">${s.supabase ? 'OK' : 'FAIL'}</span>
      </div>
      <div class="status-line">
        <span>SMTP</span>
        <span class="status-badge ${s.smtp ? 'active' : ''}">${s.smtp ? 'ВКЛ' : 'ВЫКЛ'}</span>
      </div>
    `;

    const channelsBox = document.getElementById('dash-channels');
    if (channelsBox) {
      channelsBox.innerHTML = `
        <div class="channel-line">
          <div><b>Telegram</b><span>Бот и админ-уведомления</span></div>
          <span class="status-badge ${s.telegram ? 'active' : ''}">${s.telegram ? 'ВКЛ' : 'ВЫКЛ'}</span>
        </div>
        <div class="channel-line">
          <div><b>WebChat</b><span>Виджет сайта и ручные ответы</span></div>
          <span class="status-badge ${s.webchat ? 'active' : ''}">${s.webchat ? 'ВКЛ' : 'ВЫКЛ'}</span>
        </div>
        <div class="channel-line">
          <div><b>Supabase</b><span>Синхронизация заявок</span></div>
          <span class="status-badge ${s.supabase ? 'active' : ''}">${s.supabase ? 'OK' : 'FAIL'}</span>
        </div>
        <div class="channel-line">
          <div><b>SMTP</b><span>Email-уведомления</span></div>
          <span class="status-badge ${s.smtp ? 'active' : ''}">${s.smtp ? 'ВКЛ' : 'ВЫКЛ'}</span>
        </div>
      `;
    }
  }
  
  // Onboarding
  const obList = document.getElementById('dash-onboarding');
  const ob = data.onboarding;
  if (ob) {
    const items = [
      { label: 'AI Провайдер настроен', ok: ob.aiConfigured },
      { label: 'Supabase подключен', ok: ob.supabaseConfigured },
      { label: 'Telegram бот активен', ok: ob.telegramConfigured },
      { label: 'Веб-чат доступен', ok: ob.webchatConfigured },
      { label: 'SMTP настроен', ok: ob.smtpConfigured },
      { label: 'База знаний загружена', ok: ob.knowledgeLoaded },
    ];
    const pending = items.filter(it => !it.ok).length;
    const pendingWord = pending === 1 ? 'пункт требует' : pending < 5 ? 'пункта требуют' : 'пунктов требуют';
    obList.innerHTML = (pending
      ? `<div class="attention-summary"><b>${pending} ${pendingWord} внимания</b><span>Закройте их в интеграциях или базе знаний.</span></div>`
      : '<div class="attention-summary ok"><b>Критичных пунктов нет</b><span>Основные настройки выглядят заполненными.</span></div>') + items.map(it => `
      <div class="onboarding-item ${it.ok ? 'done' : ''}">
        <div class="ob-check">${it.ok ? '✓' : ''}</div>
        <span>${it.label}</span>
      </div>
    `).join('');
  }
}

// --- Settings ---
async function loadSettings() {
  settings = await apiFetch('/settings');
  
  // General settings
  if (document.getElementById('setting-ai-provider')) {
    document.getElementById('setting-ai-provider').value = settings.AI_PROVIDER;
    document.getElementById('setting-public-url').value = settings.PUBLIC_BASE_URL || '';
  }
  updateSettingsSummary();
  
  // Update provider statuses
  updateProviderStatuses();
  updateIntegrationStatuses();
}

function updateSettingsSummary() {
  const providerLabel = document.getElementById('settings-ai-provider-label');
  const publicUrlLabel = document.getElementById('settings-public-url-label');
  if (providerLabel) providerLabel.textContent = settings.AI_PROVIDER || 'не выбран';
  if (publicUrlLabel) publicUrlLabel.textContent = settings.PUBLIC_BASE_URL ? 'задан' : 'не задан';
  renderHotelProfile();
}

const HOTEL_PROFILE_FIELDS = [
  'hotelName',
  'address',
  'city',
  'phone',
  'email',
  'website',
  'checkInTime',
  'checkOutTime',
  'parkingInfo',
  'wifiInfo',
  'breakfastInfo',
  'petsPolicy',
  'shortDescription'
];

function hotelValue(key) {
  const value = settings[key];
  return value == null || value === '' ? '—' : String(value);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderHotelProfile() {
  if (!document.getElementById('hotel-profile-view')) return;
  setText('hotel-profile-name', hotelValue('hotelName'));
  setText('hotel-profile-description', hotelValue('shortDescription'));
  setText('hotel-profile-address', hotelValue('address'));
  setText('hotel-profile-city', hotelValue('city'));
  setText('hotel-profile-phone', hotelValue('phone'));
  setText('hotel-profile-email', hotelValue('email'));
  setText('hotel-profile-website', hotelValue('website'));
  setText('hotel-profile-checkin', hotelValue('checkInTime'));
  setText('hotel-profile-checkout', hotelValue('checkOutTime'));
  setText('hotel-profile-parking', hotelValue('parkingInfo'));
  setText('hotel-profile-wifi', hotelValue('wifiInfo'));
  setText('hotel-profile-breakfast', hotelValue('breakfastInfo'));
  setText('hotel-profile-pets', hotelValue('petsPolicy'));
}

function fillHotelProfileForm() {
  HOTEL_PROFILE_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (el) el.value = settings[key] || '';
  });
}

function editHotelProfile() {
  fillHotelProfileForm();
  document.getElementById('hotel-profile-view')?.classList.add('hidden');
  document.getElementById('hotel-profile-form')?.classList.remove('hidden');
  const result = document.getElementById('hotel-profile-result');
  if (result) result.textContent = '';
}

function cancelHotelProfileEdit() {
  document.getElementById('hotel-profile-form')?.classList.add('hidden');
  document.getElementById('hotel-profile-view')?.classList.remove('hidden');
}

async function saveHotelProfile(event) {
  event.preventDefault();
  const update = {};
  HOTEL_PROFILE_FIELDS.forEach(key => {
    update[key] = document.getElementById(key)?.value || '';
  });
  await apiFetch('/settings', { method: 'POST', body: JSON.stringify(update) });
  settings = await apiFetch('/settings');
  renderHotelProfile();
  cancelHotelProfileEdit();
  const result = document.getElementById('hotel-profile-result');
  if (result) {
    result.style.display = 'block';
    result.style.color = 'var(--success)';
    result.textContent = '✓ Профиль сохранён';
  }
}

async function updateProviderStatuses() {
  const orStatus = document.getElementById('status-openrouter');
  const orIntegrationStatus = document.getElementById('status-integr-openrouter');
  if (orStatus) {
    if (settings.OPENROUTER_ENABLED === true || settings.OPENROUTER_ENABLED === 'true') {
        orStatus.className = 'status-badge active';
        orStatus.innerHTML = '<div class="status-dot"></div> Подключено';
    } else {
        orStatus.className = 'status-badge';
        orStatus.innerHTML = '<div class="status-dot"></div> Не активно';
    }
  }
  if (orIntegrationStatus) {
    orIntegrationStatus.className = orStatus ? orStatus.className : 'status-badge';
    orIntegrationStatus.innerHTML = orStatus ? orStatus.innerHTML : '<div class="status-dot"></div> Не активно';
  }

  const dsStatus = document.getElementById('status-deepseek');
  if (dsStatus) {
    if (settings.DEEPSEEK_ENABLED === true || settings.DEEPSEEK_ENABLED === 'true') {
        dsStatus.className = 'status-badge active';
        dsStatus.innerHTML = '<div class="status-dot"></div> Подключено';
    } else {
        dsStatus.className = 'status-badge';
        dsStatus.innerHTML = '<div class="status-dot"></div> Не активно';
    }
  }
  updateCurrentProviderCard();
}

function updateCurrentProviderCard() {
  const name = document.getElementById('provider-current-name');
  const model = document.getElementById('provider-current-model');
  const status = document.getElementById('provider-current-status');
  if (!name || !model || !status) return;
  const provider = settings.AI_PROVIDER || 'mock';
  const labels = { openrouter: 'OpenRouter', deepseek: 'DeepSeek Direct', mock: 'Mock Offline' };
  const modelValue = provider === 'openrouter'
    ? (settings.OPENROUTER_MODEL || 'deepseek/deepseek-chat')
    : provider === 'deepseek'
      ? (settings.DEEPSEEK_MODEL || 'deepseek-chat')
      : 'mock-response';
  const active = provider === 'openrouter'
    ? isOn(settings.OPENROUTER_ENABLED)
    : provider === 'deepseek'
      ? isOn(settings.DEEPSEEK_ENABLED)
      : true;
  name.textContent = labels[provider] || provider;
  model.textContent = 'Модель: ' + modelValue;
  status.className = 'status-badge' + (active ? ' active' : '');
  status.innerHTML = '<div class="status-dot"></div> ' + (active ? 'Подключено' : 'Не активно');
}

function setStatus(id, active, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'status-badge' + (active ? ' active' : '');
  el.innerHTML = '<div class="status-dot"></div> ' + label;
}

function isOn(val) { return val === true || val === 'true'; }
function isConfigured(val) { return val && val !== '' && val !== 'configured' ? true : val === 'configured'; }

async function updateIntegrationStatuses() {
  setStatus('status-smtp', isOn(settings.SMTP_ENABLED), isOn(settings.SMTP_ENABLED) ? 'Активен' : 'Выключен');
  setStatus('status-supabase', isConfigured(settings.SUPABASE_URL), isConfigured(settings.SUPABASE_URL) ? 'Настроено' : 'Не настроено');
  setStatus('status-telegram', isOn(settings.TELEGRAM_ENABLED), isOn(settings.TELEGRAM_ENABLED) ? 'Активен' : 'Выключен');
  setStatus('status-vk', isOn(settings.VK_ENABLED), isOn(settings.VK_ENABLED) ? 'Активен' : 'Выключен');
  setStatus('status-webchat', isOn(settings.WEBCHAT_ENABLED), isOn(settings.WEBCHAT_ENABLED) ? 'Активен' : 'Выключен');
  setStatus('status-integr-smtp', isOn(settings.SMTP_ENABLED), isOn(settings.SMTP_ENABLED) ? 'Активен' : 'Выключен');
  setStatus('status-integr-supabase', isConfigured(settings.SUPABASE_URL), isConfigured(settings.SUPABASE_URL) ? 'Настроено' : 'Не настроено');
  setStatus('status-integr-telegram', isOn(settings.TELEGRAM_ENABLED), isOn(settings.TELEGRAM_ENABLED) ? 'Активен' : 'Выключен');
  setStatus('status-integr-vk', isOn(settings.VK_ENABLED), isOn(settings.VK_ENABLED) ? 'Активен' : 'Выключен');
  setStatus('status-integr-webchat', isOn(settings.WEBCHAT_ENABLED), isOn(settings.WEBCHAT_ENABLED) ? 'Активен' : 'Выключен');
}

// --- Integration Config ---
let activeIntegrationConfig = '';

function closeIntegrationPanel() {
  document.getElementById('integration-config-panel').classList.add('hidden');
  document.getElementById('integration-test-result').style.display = 'none';
}

function openIntegrationConfig(type) {
  activeIntegrationConfig = type;
  const panel = document.getElementById('integration-config-panel');
  const title = document.getElementById('integration-config-title');
  const form = document.getElementById('integration-config-form');
  const testResult = document.getElementById('integration-test-result');
  panel.classList.remove('hidden');
  testResult.style.display = 'none';

  if (type === 'smtp') {
    title.textContent = 'Настройка SMTP';
    form.innerHTML = `
      <div class="form-group">
        <label class="form-label">Включить уведомления</label>
        <select class="form-input" id="cfg-smtp-enabled">
          <option value="true" ${isOn(settings.SMTP_ENABLED) ? 'selected' : ''}>Да</option>
          <option value="false" ${!isOn(settings.SMTP_ENABLED) ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">SMTP Host</label>
        <input type="text" class="form-input" id="cfg-smtp-host" value="${settings.SMTP_HOST || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Порт</label>
        <input type="number" class="form-input" id="cfg-smtp-port" value="${settings.SMTP_PORT || 465}">
      </div>
      <div class="form-group">
        <label class="form-label">Логин</label>
        <input type="text" class="form-input" id="cfg-smtp-user" value="${settings.SMTP_USER || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Пароль</label>
        <input type="password" class="form-input" id="cfg-smtp-pass" placeholder="${settings.SMTP_PASSWORD === 'configured' ? '••••••••' : 'Введите пароль...'}">
        <div class="form-desc">${settings.SMTP_PASSWORD === 'configured' ? 'Пароль сохранён. Оставьте пустым, чтобы не менять.' : ''}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Имя отправителя</label>
        <input type="text" class="form-input" id="cfg-smtp-from-name" value="${settings.SMTP_FROM_NAME || 'БМ Консьерж'}">
      </div>
      <div class="form-group">
        <label class="form-label">Email отправителя</label>
        <input type="email" class="form-input" id="cfg-smtp-from-email" value="${settings.SMTP_FROM_EMAIL || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Email администратора (получатель)</label>
        <input type="email" class="form-input" id="cfg-smtp-admin" value="${settings.ADMIN_NOTIFICATION_EMAIL || ''}">
      </div>
    `;
  } else if (type === 'supabase') {
    title.textContent = 'Настройка Supabase';
    form.innerHTML = `
      <div class="form-group">
        <label class="form-label">URL проекта</label>
        <input type="text" class="form-input" id="cfg-supa-url" value="${settings.SUPABASE_URL || ''}" placeholder="https://xxx.supabase.co">
      </div>
      <div class="form-group">
        <label class="form-label">Service Role Key</label>
        <input type="password" class="form-input" id="cfg-supa-key" placeholder="${settings.SUPABASE_SERVICE_ROLE_KEY === 'configured' ? '••••••••' : 'eyJ...'}">
        <div class="form-desc">${settings.SUPABASE_SERVICE_ROLE_KEY === 'configured' ? 'Ключ сохранён. Оставьте пустым, чтобы не менять.' : ''}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Таблица заявок</label>
        <input type="text" class="form-input" id="cfg-supa-table" value="${settings.SUPABASE_LEADS_TABLE || 'leads'}">
      </div>
    `;
  } else if (type === 'telegram') {
    title.textContent = 'Настройка Telegram';
    form.innerHTML = `
      <div class="form-group">
        <label class="form-label">Включить</label>
        <select class="form-input" id="cfg-tg-enabled">
          <option value="true" ${isOn(settings.TELEGRAM_ENABLED) ? 'selected' : ''}>Да</option>
          <option value="false" ${!isOn(settings.TELEGRAM_ENABLED) ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Bot Token</label>
        <input type="password" class="form-input" id="cfg-tg-token" placeholder="${settings.TELEGRAM_BOT_TOKEN === 'configured' ? '••••••••' : '123456:ABC...'}">
        <div class="form-desc">${settings.TELEGRAM_BOT_TOKEN === 'configured' ? 'Токен сохранён. Оставьте пустым, чтобы не менять.' : ''}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Telegram ID администраторов</label>
        <textarea class="form-input" id="cfg-tg-admin-ids" rows="3" placeholder="123456789, 987654321">${settings.TELEGRAM_ADMIN_IDS || settings.TELEGRAM_ADMIN_ID || ''}</textarea>
        <div class="form-desc">Можно указать несколько chat_id через запятую, пробел или с новой строки. Этим администраторам будут приходить уведомления о заявках и диалогах, требующих внимания.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Режим подключения</label>
        <select class="form-input" id="cfg-tg-mode">
          <option value="polling" ${settings.TELEGRAM_MODE === 'polling' ? 'selected' : ''}>Polling</option>
          <option value="webhook" ${settings.TELEGRAM_MODE === 'webhook' ? 'selected' : ''}>Webhook</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Webhook URL (только для webhook-режима)</label>
        <input type="text" class="form-input" id="cfg-tg-webhook" value="${settings.TELEGRAM_WEBHOOK_URL || ''}" placeholder="https://ai.4-am.ru/webhooks/telegram">
      </div>
      <div class="form-desc" style="margin-top:8px;">После изменения токена потребуется перезапуск сервера.</div>
    `;
  } else if (type === 'vk') {
    title.textContent = 'Настройка ВКонтакте';
    form.innerHTML = `
      <div class="form-group">
        <label class="form-label">Включить</label>
        <select class="form-input" id="cfg-vk-enabled">
          <option value="true" ${isOn(settings.VK_ENABLED) ? 'selected' : ''}>Да</option>
          <option value="false" ${!isOn(settings.VK_ENABLED) ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Токен группы</label>
        <input type="password" class="form-input" id="cfg-vk-token" placeholder="${settings.VK_GROUP_TOKEN === 'configured' ? '••••••••' : 'vk1.a...'}">
        <div class="form-desc">${settings.VK_GROUP_TOKEN === 'configured' ? 'Токен сохранён. Оставьте пустым, чтобы не менять.' : ''}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Код подтверждения сервера</label>
        <input type="text" class="form-input" id="cfg-vk-confirm" placeholder="${settings.VK_CONFIRMATION_TOKEN === 'configured' ? '••••••••' : 'из настроек Callback API'}">
        <div class="form-desc">${settings.VK_CONFIRMATION_TOKEN === 'configured' ? 'Код сохранён.' : ''}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Секретный ключ (Secret Key)</label>
        <input type="password" class="form-input" id="cfg-vk-secret" placeholder="${settings.VK_SECRET_KEY === 'configured' ? '••••••••' : 'Опционально'}">
      </div>
      <div class="form-desc" style="margin-top:8px;">Webhook URL для VK: <code style="font-family:monospace; background:rgba(255,255,255,.07); padding:2px 6px; border-radius:4px;">${window.location.origin}/webhooks/vk</code></div>
    `;
  } else if (type === 'webchat') {
    title.textContent = 'Настройка WebChat';
    form.innerHTML = `
      <div class="form-group">
        <label class="form-label">Включить виджет</label>
        <select class="form-input" id="cfg-wc-enabled">
          <option value="true" ${isOn(settings.WEBCHAT_ENABLED) ? 'selected' : ''}>Да</option>
          <option value="false" ${!isOn(settings.WEBCHAT_ENABLED) ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Разрешённые Origins (через запятую)</label>
        <input type="text" class="form-input" id="cfg-wc-origins" value="${settings.WEBCHAT_ALLOWED_ORIGINS || ''}">
        <div class="form-desc">Например: https://4-am.ru,https://www.4-am.ru</div>
      </div>
      <div class="form-desc" style="margin-top:8px;">
        Подключите виджет на сайт:<br>
        <code style="font-family:monospace; background:rgba(255,255,255,.07); padding:2px 6px; border-radius:4px; font-size:11px;">&lt;script src="${window.location.origin}/widget.js"&gt;&lt;/script&gt;</code>
      </div>
    `;
    // Скрываем кнопку "Проверить связь" — не применима
    document.getElementById('btn-test-integration').style.display = 'none';
    return;
  }
  document.getElementById('btn-test-integration').style.display = '';
}

async function saveIntegrationSettings() {
  let update = {};

  if (activeIntegrationConfig === 'smtp') {
    update = {
      SMTP_ENABLED: document.getElementById('cfg-smtp-enabled').value === 'true',
      SMTP_HOST: document.getElementById('cfg-smtp-host').value,
      SMTP_PORT: document.getElementById('cfg-smtp-port').value,
      SMTP_USER: document.getElementById('cfg-smtp-user').value,
      SMTP_PASSWORD: document.getElementById('cfg-smtp-pass').value,
      SMTP_FROM_NAME: document.getElementById('cfg-smtp-from-name').value,
      SMTP_FROM_EMAIL: document.getElementById('cfg-smtp-from-email').value,
      ADMIN_NOTIFICATION_EMAIL: document.getElementById('cfg-smtp-admin').value,
    };
  } else if (activeIntegrationConfig === 'supabase') {
    update = {
      SUPABASE_URL: document.getElementById('cfg-supa-url').value,
      SUPABASE_SERVICE_ROLE_KEY: document.getElementById('cfg-supa-key').value,
      SUPABASE_LEADS_TABLE: document.getElementById('cfg-supa-table').value,
    };
  } else if (activeIntegrationConfig === 'telegram') {
    update = {
      TELEGRAM_ENABLED: document.getElementById('cfg-tg-enabled').value === 'true',
      TELEGRAM_BOT_TOKEN: document.getElementById('cfg-tg-token').value,
      TELEGRAM_ADMIN_IDS: document.getElementById('cfg-tg-admin-ids').value,
      TELEGRAM_MODE: document.getElementById('cfg-tg-mode').value,
      TELEGRAM_WEBHOOK_URL: document.getElementById('cfg-tg-webhook').value,
    };
  } else if (activeIntegrationConfig === 'vk') {
    update = {
      VK_ENABLED: document.getElementById('cfg-vk-enabled').value === 'true',
      VK_GROUP_TOKEN: document.getElementById('cfg-vk-token').value,
      VK_CONFIRMATION_TOKEN: document.getElementById('cfg-vk-confirm').value,
      VK_SECRET_KEY: document.getElementById('cfg-vk-secret').value,
    };
  } else if (activeIntegrationConfig === 'webchat') {
    update = {
      WEBCHAT_ENABLED: document.getElementById('cfg-wc-enabled').value === 'true',
      WEBCHAT_ALLOWED_ORIGINS: document.getElementById('cfg-wc-origins').value,
    };
  }

  await apiFetch('/settings', { method: 'POST', body: JSON.stringify(update) });
  showTestResult('integration', true, 'Настройки сохранены');
  loadSettings();
}

async function testIntegrationConnection() {
  const resultEl = document.getElementById('integration-test-result');
  resultEl.style.display = 'block';
  resultEl.textContent = 'Проверяем...';
  resultEl.style.color = 'var(--muted)';

  let res;
  if (activeIntegrationConfig === 'smtp') {
    res = await apiFetch('/smtp/test', { method: 'POST' });
  } else if (activeIntegrationConfig === 'supabase') {
    res = await apiFetch('/supabase/test', { method: 'POST' });
  } else if (activeIntegrationConfig === 'telegram') {
    res = await apiFetch('/telegram/admin-test', { method: 'POST' });
  } else {
    resultEl.textContent = 'Тест для этой интеграции не поддерживается';
    return;
  }

  if (res.success) {
    resultEl.style.color = 'var(--success)';
    resultEl.textContent = activeIntegrationConfig === 'telegram'
      ? `✓ Тест отправлен: ${res.sent || 0}`
      : '✓ Подключение успешно';
  } else {
    resultEl.style.color = 'var(--danger)';
    resultEl.textContent = '✗ Ошибка: ' + (res.error || 'неизвестная ошибка');
  }
}

function showTestResult(scope, ok, msg) {
  const id = scope === 'integration' ? 'integration-test-result' : 'provider-test-result';
  const el = document.getElementById(id);
  if (!el) return;
  renderProviderTestResult(el, ok, msg);
}

function renderProviderTestResult(el, ok, msg) {
  if (!el) return;
  el.style.display = 'block';
  el.style.color = ok ? 'var(--success)' : 'var(--danger)';
  el.textContent = (ok ? '✓ ' : '✗ ') + msg;
}

// Backward compat (old openSmtpConfig calls)
function openSmtpConfig() { openIntegrationConfig('smtp'); }

let activeProviderConfig = '';

function openProviderConfig(provider) {
  activeProviderConfig = provider;
  const panel = document.getElementById('provider-config-panel');
  panel.classList.remove('hidden');
  
  const title = document.getElementById('provider-config-title');
  const form = document.getElementById('provider-config-form');
  
  if (provider === 'openrouter') {
    title.textContent = 'Настройка OpenRouter';
    form.innerHTML = `
      <div class="form-group">
        <label class="form-label">Включить</label>
        <select class="form-input" id="cfg-or-enabled">
          <option value="true" ${settings.OPENROUTER_ENABLED === true || settings.OPENROUTER_ENABLED === 'true' ? 'selected' : ''}>Да</option>
          <option value="false" ${settings.OPENROUTER_ENABLED === false || settings.OPENROUTER_ENABLED === 'false' ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">API Ключ</label>
        <input type="password" class="form-input" id="cfg-or-key" placeholder="${settings.OPENROUTER_API_KEY === 'configured' ? '********' : 'sk-...'}">
      </div>
      <div class="form-group">
        <label class="form-label">Выбрать из популярных</label>
        <select class="form-input" id="cfg-or-model-presets" onchange="if(this.value){document.getElementById('cfg-or-model').value=this.value;} this.selectedIndex=0;">
          <option value="">— выберите модель —</option>
          <option value="deepseek/deepseek-chat">DeepSeek Chat (deepseek/deepseek-chat)</option>
          <option value="deepseek/deepseek-r1">DeepSeek R1 (deepseek/deepseek-r1)</option>
          <option value="google/gemini-2.5-pro">Gemini 2.5 Pro (google/gemini-2.5-pro)</option>
          <option value="google/gemini-2.5-flash">Gemini 2.5 Flash (google/gemini-2.5-flash)</option>
          <option value="openai/gpt-chat-latest">OpenAI GPT Chat Latest (openai/gpt-chat-latest)</option>
          <option value="anthropic/claude-sonnet-4">Claude Sonnet (anthropic/claude-sonnet-4)</option>
          <option value="openrouter/auto">OpenRouter Auto (openrouter/auto)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Модель</label>
        <input type="text" class="form-input" id="cfg-or-model" value="${settings.OPENROUTER_MODEL || 'deepseek/deepseek-chat'}">
      </div>
      <div class="form-group">
        <label class="form-label">Base URL</label>
        <input type="text" class="form-input" id="cfg-or-url" value="${settings.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}">
      </div>
    `;
  } else if (provider === 'deepseek') {
    title.textContent = 'Настройка DeepSeek Direct';
    form.innerHTML = `
      <div class="form-group">
        <label class="form-label">Включить</label>
        <select class="form-input" id="cfg-ds-enabled">
          <option value="true" ${settings.DEEPSEEK_ENABLED === true || settings.DEEPSEEK_ENABLED === 'true' ? 'selected' : ''}>Да</option>
          <option value="false" ${settings.DEEPSEEK_ENABLED === false || settings.DEEPSEEK_ENABLED === 'false' ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">API Ключ</label>
        <input type="password" class="form-input" id="cfg-ds-key" placeholder="${settings.DEEPSEEK_API_KEY === 'configured' ? '********' : 'sk-...'}">
      </div>
      <div class="form-group">
        <label class="form-label">Модель</label>
        <input type="text" class="form-input" id="cfg-ds-model" value="${settings.DEEPSEEK_MODEL || 'deepseek-chat'}">
      </div>
    `;
  } else if (provider === 'mock') {
    title.textContent = 'Настройка Mock Провайдера';
    form.innerHTML = '<p>Настроек не требуется. Всегда возвращает фиксированные ответы.</p>';
  }
}

async function saveProviderSettings() {
  let update = {};
  if (activeProviderConfig === 'openrouter') {
    update = {
      OPENROUTER_ENABLED: document.getElementById('cfg-or-enabled').value === 'true',
      OPENROUTER_API_KEY: document.getElementById('cfg-or-key').value,
      OPENROUTER_MODEL: document.getElementById('cfg-or-model').value,
      OPENROUTER_BASE_URL: document.getElementById('cfg-or-url').value
    };
  } else if (activeProviderConfig === 'deepseek') {
    update = {
      DEEPSEEK_ENABLED: document.getElementById('cfg-ds-enabled').value === 'true',
      DEEPSEEK_API_KEY: document.getElementById('cfg-ds-key').value,
      DEEPSEEK_MODEL: document.getElementById('cfg-ds-model').value
    };
  }
  
  await apiFetch('/settings', { method: 'POST', body: JSON.stringify(update) });
  showTestResult('provider', true, 'Настройки сохранены');
  loadSettings();
}

async function testProviderConnection() {
  const resultEl = document.getElementById('provider-test-result');
  if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = 'Проверяем...'; resultEl.style.color = 'var(--muted)'; }
  const res = await apiFetch('/ai/test', {
    method: 'POST',
    body: JSON.stringify({ provider: activeProviderConfig })
  });
  showTestResult('provider', res.success, res.success ? 'Подключение успешно' : (res.error || 'ошибка'));
}

async function testCurrentProviderConnection() {
  const resultEl = document.getElementById('current-provider-test-result');
  if (resultEl) {
    resultEl.style.display = 'block';
    resultEl.style.color = 'var(--muted)';
    resultEl.textContent = 'Проверяем...';
  }
  const provider = settings.AI_PROVIDER || 'mock';
  const res = await apiFetch('/ai/test', {
    method: 'POST',
    body: JSON.stringify({ provider })
  });
  renderProviderTestResult(resultEl, res.success, res.success ? 'Подключение успешно' : (res.error || 'ошибка'));
}


async function saveGeneralSettings() {
  const update = {
    AI_PROVIDER: document.getElementById('setting-ai-provider').value,
    PUBLIC_BASE_URL: document.getElementById('setting-public-url').value
  };
  await apiFetch('/settings', { method: 'POST', body: JSON.stringify(update) });
  const btn = document.querySelector('#view-settings .btn');
  if (btn) { const orig = btn.textContent; btn.textContent = '✓ Сохранено'; setTimeout(() => btn.textContent = orig, 2000); }
  loadSettings();
}

// --- Conversations (Operator Inbox) ---
let allConversations = [];
let currentFilter = 'all';
let currentConvDetail = null;

const STATUS_BADGES = {
  ai: { label: 'ИИ отвечает', cls: 'badge-ai' },
  needs_attention: { label: 'Нужен администратор', cls: 'badge-attention' },
  operator: { label: 'Администратор отвечает', cls: 'badge-operator' },
  lead_created: { label: 'Заявка создана', cls: 'badge-lead' },
  closed: { label: 'Закрыт', cls: 'badge-closed' },
  error: { label: 'Ошибка', cls: 'badge-error' },
};
const ROLE_LABEL = { guest: 'Гость', assistant: 'ИИ', operator: 'Администратор' };

function statusBadge(status) {
  const b = STATUS_BADGES[status] || STATUS_BADGES.ai;
  return `<span class="conv-badge ${b.cls}">${b.label}</span>`;
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function opErrorMsg(code, message) {
  switch (code) {
    case 'not_configured':
    case 'unauthorized':
    case 'service_unavailable': return 'Нет доступа или не настроен Operator API';
    case 'not_in_manual_mode': return 'Сначала возьмите диалог на себя';
    case 'channel_not_supported': return 'Ручной ответ для этого канала не поддерживается';
    case 'channel_send_failed': return 'Не удалось отправить сообщение в канал';
    case 'conversation_closed': return 'Диалог закрыт';
    case 'empty_text': return 'Введите текст ответа';
    case 'not_found': return 'Диалог не найден';
    default: return message || 'Ошибка';
  }
}
function showChatError(msg) {
  const el = document.getElementById('chat-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideChatError() {
  const el = document.getElementById('chat-error');
  if (el) el.classList.add('hidden');
}

function setConvFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.conv-filter').forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === f));
  renderConvList();
}
window.setConvFilter = setConvFilter;

function convMatchesFilter(c) {
  switch (currentFilter) {
    case 'needs_attention': return c.needsAttention === true || c.status === 'needs_attention';
    case 'operator': return c.status === 'operator';
    case 'ai': return c.status === 'ai';
    case 'closed': return c.status === 'closed';
    default: return true;
  }
}

async function loadConversations() {
  const data = await apiFetch('/operator/conversations?filter=all');
  const container = document.getElementById('conv-list-container');
  if (!data || data.error) {
    allConversations = [];
    container.innerHTML = '<div class="empty">' + opErrorMsg(data && data.error && data.error.code) + '</div>';
    return;
  }
  allConversations = data.items || [];
  renderConvList();
}
window.loadConversations = loadConversations;

function renderConvList() {
  const container = document.getElementById('conv-list-container');
  const query = (document.getElementById('conv-search')?.value || '').trim().toLowerCase();
  const items = allConversations
    .filter(convMatchesFilter)
    .filter(c => {
      if (!query) return true;
      return [
        c.guestName,
        c.lastMessagePreview,
        c.channel,
        c.status,
        c.linkedLeadId
      ].some(value => String(value || '').toLowerCase().includes(query));
    });
  if (!items.length) {
    container.innerHTML = '<div class="empty empty-rich"><b>Диалогов по фильтру нет</b><span>Измените статус, очистите поиск или дождитесь нового обращения гостя.</span></div>';
    return;
  }
  container.innerHTML = items.map(c => `
    <div class="conv-item ${currentConversationId === c.id ? 'active' : ''}" onclick="openConversation('${encodeURIComponent(c.id)}')">
      <div class="conv-item-top">
        <span class="conv-item-name">${escapeHtml(c.guestName || 'Гость')}</span>
        ${statusBadge(c.status)}
      </div>
      <div class="conv-item-preview">${escapeHtml(c.lastMessagePreview || '—')}</div>
      <div class="conv-item-meta">
        <span class="conv-chan">${escapeHtml(c.channel || '')}</span>
        <span>${c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : ''}</span>
        ${c.linkedLeadId ? '<span class="conv-lead">📋 заявка</span>' : ''}
      </div>
    </div>
  `).join('');
}

async function openConversation(encId) {
  const id = decodeURIComponent(encId);
  currentConversationId = id;
  hideChatError();

  const conv = await apiFetch('/operator/conversations/' + encodeURIComponent(id));
  if (!conv || conv.error) { showChatError(opErrorMsg(conv && conv.error && conv.error.code)); return; }
  currentConvDetail = conv;
  renderConvList(); // подсветить активный

  document.getElementById('chat-title').innerHTML = escapeHtml(conv.guestName || 'Гость') + ' ' + statusBadge(conv.status);
  document.getElementById('chat-actions').classList.remove('hidden');

  const closed = conv.status === 'closed';
  document.getElementById('btn-takeover').disabled = closed || conv.manualMode === true;
  document.getElementById('btn-return').disabled = closed || conv.manualMode !== true;
  document.getElementById('btn-close').disabled = closed;
  renderConversationContext(conv);

  const sub = document.getElementById('chat-subbar');
  let subHtml = `<span class="sub-chip">Канал: ${escapeHtml(conv.channel || '—')}</span>`;
  if (conv.assignedTo) subHtml += `<span class="sub-chip">Оператор: ${escapeHtml(conv.assignedTo)}</span>`;
  if (conv.linkedLeadId) subHtml += `<span class="sub-chip">Заявка: ${escapeHtml(conv.linkedLeadId)}</span>`;
  if (conv.aiSummary) subHtml += `<div class="sub-summary">AI-резюме: ${escapeHtml(conv.aiSummary)}</div>`;
  sub.innerHTML = subHtml;
  sub.classList.remove('hidden');

  const chatMessages = document.getElementById('chat-messages');
  const msgs = (conv.messages || []).filter(m => m.text && String(m.text).trim());
  chatMessages.innerHTML = msgs.map(m => `
    <div class="msg msg-${m.role}">
      <div class="msg-role">${ROLE_LABEL[m.role] || escapeHtml(m.role)}</div>
      <div class="msg-text">${escapeHtml(m.text)}</div>
      <div class="msg-time">${m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : ''}</div>
    </div>
  `).join('') || '<div class="empty">Нет сообщений</div>';
  chatMessages.scrollTop = chatMessages.scrollHeight;

  configureReplyArea(conv);
}
window.openConversation = openConversation;

function renderConversationContext(conv) {
  const context = document.getElementById('conversation-context');
  if (!context) return;
  const closed = conv.status === 'closed';
  context.innerHTML = `
    <div class="context-card">
      <div class="context-title">Карточка диалога</div>
      <div class="context-row"><span>Канал</span><b>${escapeHtml(conv.channel || '—')}</b></div>
      <div class="context-row"><span>Гость</span><b>${escapeHtml(conv.guestName || 'Гость')}</b></div>
      <div class="context-row"><span>Статус</span>${statusBadge(conv.status)}</div>
      <div class="context-row"><span>Режим</span><b>${conv.manualMode ? 'Оператор' : 'ИИ'}</b></div>
      ${conv.linkedLeadId ? `<div class="context-row"><span>Заявка</span><b>${escapeHtml(conv.linkedLeadId)}</b></div>` : ''}
    </div>
    <div class="context-card">
      <div class="context-title">AI-резюме</div>
      <p class="context-summary">${escapeHtml(conv.aiSummary || 'Резюме появится после накопления контекста диалога.')}</p>
    </div>
    <div class="context-card">
      <div class="context-title">Действия</div>
      <button class="btn btn-secondary context-action" onclick="opAction('take-over')" ${closed || conv.manualMode === true ? 'disabled' : ''}>Взять на себя</button>
      <button class="btn btn-secondary context-action" onclick="opAction('return-to-ai')" ${closed || conv.manualMode !== true ? 'disabled' : ''}>Вернуть ИИ</button>
      <button class="btn btn-secondary context-action danger" onclick="opAction('close')" ${closed ? 'disabled' : ''}>Закрыть</button>
    </div>
  `;
}

function configureReplyArea(conv) {
  const area = document.getElementById('chat-input-area');
  const hint = document.getElementById('reply-hint');
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('reply-send-btn');
  area.classList.remove('hidden');

  let disabled = false, hintMsg = '';
  if (conv.status === 'closed') { disabled = true; hintMsg = 'Диалог закрыт.'; }
  else if (conv.channel === 'webchat') { /* активно, подсказка ниже */ }
  else if (conv.channel !== 'telegram' && conv.channel !== 'vk') { disabled = true; hintMsg = 'Ручной ответ для этого канала не поддерживается.'; }
  if (!disabled && conv.manualMode !== true) { disabled = true; hintMsg = 'Сначала нажмите «Взять на себя».'; }
  if (!disabled && conv.channel === 'webchat') { hintMsg = 'Ответ будет доставлен гостю через виджет сайта.'; }

  input.disabled = disabled;
  btn.disabled = disabled;
  if (hintMsg) { hint.textContent = hintMsg; hint.classList.remove('hidden'); }
  else { hint.classList.add('hidden'); }
}

async function opAction(action) {
  if (!currentConversationId) return;
  hideChatError();
  const body = action === 'take-over' ? JSON.stringify({ assignedTo: 'Админ' }) : '{}';
  const data = await apiFetch('/operator/conversations/' + encodeURIComponent(currentConversationId) + '/' + action, { method: 'POST', body });
  if (data && data.error) { showChatError(opErrorMsg(data.error.code, data.error.message)); }
  await loadConversations();
  await openConversation(encodeURIComponent(currentConversationId));
}
window.opAction = opAction;

async function sendOperatorReply() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentConversationId) return;
  const conv = currentConvDetail;
  if (conv && conv.status === 'closed') { showChatError('Диалог закрыт.'); return; }
  if (conv && conv.channel !== 'telegram' && conv.channel !== 'vk' && conv.channel !== 'webchat') { showChatError('Ручной ответ для этого канала не поддерживается.'); return; }
  if (conv && conv.manualMode !== true) { showChatError('Сначала нажмите «Взять на себя».'); return; }

  hideChatError();
  const data = await apiFetch('/operator/conversations/' + encodeURIComponent(currentConversationId) + '/reply', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
  if (data && data.error) { showChatError(opErrorMsg(data.error.code, data.error.message)); return; }
  input.value = '';
  await openConversation(encodeURIComponent(currentConversationId));
  await loadConversations();
}
window.sendOperatorReply = sendOperatorReply;

// --- Leads ---
async function loadLeads() {
  const leads = await apiFetch('/leads');
  const body = document.getElementById('leads-table-body');
  if (Array.isArray(leads)) {
    body.innerHTML = leads.map(l => `
      <tr>
        <td>${new Date(l.created_at).toLocaleString()}</td>
        <td>${l.guest_name}</td>
        <td>${l.guest_contact}</td>
        <td>${l.channel}</td>
        <td><span class="status-badge ${l.supabase_status === 'sent' ? 'active' : ''}">${l.supabase_status}</span></td>
        <td><button class="btn" style="padding:4px 8px; font-size:12px;" onclick="sendLeadToSupa('${l.id}')">Повтор</button></td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="empty">Нет заявок</td></tr>';
  }
}

async function sendLeadToSupa(id) {
    const res = await apiFetch('/leads/' + id + '/send', { method: 'POST' });
    if (res.success) {
        alert('Заявка отправлена');
        loadLeads();
    } else {
        alert('Ошибка: ' + res.error);
    }
}

// --- KB ---
let knowledgeEntries = [];
let knowledgeSourceFilter = '';

async function loadKBStatus() {
  const status = await apiFetch('/kb/status');
  const info = document.getElementById('kb-status-info');
  const files = status.files || [];
  info.innerHTML = `
    <div>Всего чанков: <b>${status.totalChunks}</b></div>
    <div>Файлов: <b>${files.length}</b></div>
    <div class="kb-file-pills">${files.map(f => `<span class="sub-chip">${escapeHtml(f.name)}: ${f.chunks}</span>`).join('')}</div>
  `;
  await loadEditableKB();
  await loadKnowledgeEntries();
}

async function reloadKB() {
  const res = await apiFetch('/kb/reload', { method: 'POST' });
  if (res.success) {
    setKbMessage('kb-save-result', 'База знаний обновлена', true);
    loadKBStatus();
  }
}

function setKbMessage(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--success)' : 'var(--danger)';
}

async function loadEditableKB() {
  const data = await apiFetch('/kb/editable');
  if (data && typeof data.content === 'string') {
    const editor = document.getElementById('kb-edit-content');
    if (editor) editor.value = data.content;
  }
}

async function saveEditableKB() {
  const content = document.getElementById('kb-edit-content').value;
  const res = await apiFetch('/kb/editable', {
    method: 'POST',
    body: JSON.stringify({ content })
  });
  if (res.success) {
    setKbMessage('kb-save-result', 'Сохранено, база перезагружена', true);
    loadKBStatus();
  } else {
    setKbMessage('kb-save-result', 'Ошибка: ' + (res.error || 'не удалось сохранить'), false);
  }
}

async function addKnowledgeEntry() {
  return saveKnowledgeEntry();
}

async function loadKnowledgeEntries() {
  const search = document.getElementById('kb-search')?.value.trim() || '';
  const category = document.getElementById('kb-category-filter')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  const data = await apiFetch('/kb/entries?' + params.toString());
  knowledgeEntries = Array.isArray(data.entries) ? data.entries : [];
  renderKnowledgeCategoryFilter(data.categories || [], category);
  renderKnowledgeEntries();
}

function setKnowledgeSource(source) {
  knowledgeSourceFilter = source;
  document.querySelectorAll('.segment').forEach(btn => btn.classList.remove('active'));
  const activeId = source === 'manual' ? 'kb-source-manual' : source === 'scraped' ? 'kb-source-scraped' : 'kb-source-all';
  const active = document.getElementById(activeId);
  if (active) active.classList.add('active');
  renderKnowledgeEntries();
}
window.setKnowledgeSource = setKnowledgeSource;

function renderKnowledgeCategoryFilter(categories, selected) {
  const select = document.getElementById('kb-category-filter');
  if (!select) return;
  const options = ['<option value="">Все категории</option>']
    .concat(categories.map(cat => `<option value="${escapeHtml(cat.id)}" ${cat.id === selected ? 'selected' : ''}>${escapeHtml(cat.label)} (${cat.count})</option>`));
  select.innerHTML = options.join('');
}

function renderKnowledgeEntries() {
  const body = document.getElementById('kb-entries-body');
  if (!body) return;
  const visibleEntries = knowledgeSourceFilter
    ? knowledgeEntries.filter(entry => entry.source === knowledgeSourceFilter)
    : knowledgeEntries;
  if (!visibleEntries.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">Записи не найдены. Добавьте первую запись или измените фильтры.</td></tr>';
    return;
  }
  body.innerHTML = visibleEntries.map(entry => `
    <tr>
      <td><span class="status-badge">${escapeHtml(entry.category)}</span></td>
      <td><b>${escapeHtml(entry.title)}</b><div class="form-desc">${escapeHtml(entry.id)}</div></td>
      <td><div class="kb-entry-preview">${escapeHtml(entry.content)}</div></td>
      <td>${Number(entry.priority || 5)}</td>
      <td class="row-actions">
        <button class="btn btn-secondary btn-small" onclick="editKnowledgeEntry('${escapeHtml(entry.id)}')">Править</button>
        <button class="btn btn-secondary btn-small danger" onclick="deleteKnowledgeEntry('${escapeHtml(entry.id)}')">Удалить</button>
      </td>
    </tr>
  `).join('');
}

function startKnowledgeAdd() {
  document.getElementById('kb-entry-form').classList.remove('hidden');
  document.getElementById('kb-form-title').textContent = 'Добавить новую запись';
  document.getElementById('kb-entry-id').value = '';
  document.getElementById('kb-new-category').value = 'custom';
  document.getElementById('kb-new-priority').value = '5';
  document.getElementById('kb-new-title').value = '';
  document.getElementById('kb-new-text').value = '';
  setKbMessage('kb-add-result', '', true);
  document.getElementById('kb-new-title').focus();
}
window.startKnowledgeAdd = startKnowledgeAdd;

function editKnowledgeEntry(id) {
  const entry = knowledgeEntries.find(item => item.id === id);
  if (!entry) return;
  document.getElementById('kb-entry-form').classList.remove('hidden');
  document.getElementById('kb-form-title').textContent = 'Редактировать запись';
  document.getElementById('kb-entry-id').value = entry.id;
  document.getElementById('kb-new-category').value = entry.category || 'custom';
  document.getElementById('kb-new-priority').value = entry.priority || 5;
  document.getElementById('kb-new-title').value = entry.title || '';
  document.getElementById('kb-new-text').value = entry.content || '';
  setKbMessage('kb-add-result', '', true);
  document.getElementById('kb-entry-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.editKnowledgeEntry = editKnowledgeEntry;

function cancelKnowledgeEdit() {
  document.getElementById('kb-entry-form').classList.add('hidden');
  setKbMessage('kb-add-result', '', true);
}
window.cancelKnowledgeEdit = cancelKnowledgeEdit;

async function saveKnowledgeEntry() {
  const id = document.getElementById('kb-entry-id').value.trim();
  const category = document.getElementById('kb-new-category').value.trim();
  const title = document.getElementById('kb-new-title').value.trim();
  const text = document.getElementById('kb-new-text').value.trim();
  const priority = Number(document.getElementById('kb-new-priority').value || 5);
  if (!title || !text) {
    setKbMessage('kb-add-result', 'Заполните заголовок и текст', false);
    return;
  }
  const path = id ? '/kb/entries/' + encodeURIComponent(id) : '/kb/chunks';
  const method = id ? 'PUT' : 'POST';
  const res = await apiFetch(path, {
    method,
    body: JSON.stringify({ category, title, text, content: text, priority })
  });
  if (res.success) {
    document.getElementById('kb-new-title').value = '';
    document.getElementById('kb-new-text').value = '';
    document.getElementById('kb-entry-id').value = '';
    document.getElementById('kb-entry-form').classList.add('hidden');
    setKbMessage('kb-add-result', id ? 'Запись обновлена, база перезагружена' : 'Запись добавлена, база перезагружена', true);
    await loadKBStatus();
  } else {
    setKbMessage('kb-add-result', 'Ошибка: ' + (res.error || 'не удалось сохранить'), false);
  }
}
window.saveKnowledgeEntry = saveKnowledgeEntry;

async function deleteKnowledgeEntry(id) {
  if (!confirm('Удалить эту запись из базы знаний?')) return;
  const res = await apiFetch('/kb/entries/' + encodeURIComponent(id), { method: 'DELETE' });
  if (res.success) {
    await loadKBStatus();
  } else {
    alert('Ошибка: ' + (res.error || 'не удалось удалить'));
  }
}
window.deleteKnowledgeEntry = deleteKnowledgeEntry;

async function testKnowledgeSearch() {
  const query = document.getElementById('kb-test-query').value.trim();
  const result = document.getElementById('kb-test-result');
  if (!query) return;
  result.classList.remove('hidden');
  result.innerHTML = '<div class="form-desc">Поиск в базе знаний...</div>';
  const data = await apiFetch('/kb/search', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
  const matches = data.matches || [];
  if (!matches.length) {
    result.innerHTML = '<div class="empty">Совпадения не найдены. Добавьте запись или уточните формулировку.</div>';
    return;
  }
  result.innerHTML = `
    <div class="config-panel-title">Найденные записи</div>
    ${matches.map(match => `
      <div class="kb-match">
        <div><b>${escapeHtml(match.title)}</b> <span class="status-badge">${escapeHtml(match.category)}</span></div>
        <div class="form-desc">${escapeHtml(match.sourceFile)} · score ${match.score}</div>
      </div>
    `).join('')}
  `;
}
window.testKnowledgeSearch = testKnowledgeSearch;
window.loadKnowledgeEntries = loadKnowledgeEntries;
window.addKnowledgeEntry = addKnowledgeEntry;

// --- Test Chat ---
function useTestPrompt(text) {
  const input = document.getElementById('test-input');
  if (!input) return;
  input.value = text;
  input.focus();
  sendTestMessage();
}
window.useTestPrompt = useTestPrompt;

async function sendTestMessage() {
  const input = document.getElementById('test-input');
  const message = input.value.trim();
  if (!message) return;
  
  const container = document.getElementById('test-messages');
  const esc = (typeof escapeHtml === 'function') ? escapeHtml : (x => String(x));
  const btn = document.querySelector('#view-test-chat .chat-input-area .btn');

  container.insertAdjacentHTML('beforeend', '<div class="msg msg-guest"><div class="msg-text">' + esc(message) + '</div></div>');
  input.value = '';
  container.scrollTop = container.scrollHeight;

  // loading state
  if (btn) btn.disabled = true;
  const thinkingId = 'test-thinking-' + Date.now();
  container.insertAdjacentHTML('beforeend',
    '<div class="msg msg-assistant msg-thinking" id="' + thinkingId + '"><div class="msg-text"><span class="typing-dots"><span></span><span></span><span></span></span> ИИ думает…</div></div>');
  container.scrollTop = container.scrollHeight;

  let res;
  try {
    res = await apiFetch('/conversations/test-session/messages', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  } catch (e) {
    res = { error: 'сеть недоступна' };
  }

  const thinking = document.getElementById(thinkingId);
  if (thinking) thinking.remove();
  if (btn) btn.disabled = false;

  if (res && typeof res.reply === 'string' && res.reply) {
    container.insertAdjacentHTML('beforeend', '<div class="msg msg-assistant"><div class="msg-text">' + esc(res.reply) + '</div></div>');
  } else {
    const errText = (res && res.error) ? ('Ошибка: ' + esc(String(res.error))) : 'Нет ответа от сервера';
    container.insertAdjacentHTML('beforeend', '<div class="msg msg-error"><div class="msg-text">' + errText + '</div></div>');
  }
  container.scrollTop = container.scrollHeight;
}

// --- Logs ---
async function loadLogs() {
  const logs = await apiFetch('/logs');
  const container = document.getElementById('logs-list');
  if (Array.isArray(logs)) {
    container.innerHTML = logs.map(e => `
      <div class="event-item">
        <div class="event-dot ${e.type.includes('ERROR') || e.type.includes('FAILED') ? 'red' : 'blue'}"></div>
        <div class="event-content">
          <div class="event-msg"><b>${e.type}</b>: ${e.message}</div>
          <div class="event-time">${new Date(e.created_at).toLocaleString()}</div>
        </div>
      </div>
    `).join('') || '<div class="empty">Лог пуст</div>';
  }
}

// Init
loadDashboard();
