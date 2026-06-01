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
  if (viewId === 'settings' || viewId === 'ai-providers' || viewId === 'integrations') loadSettings();
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
    `).join('') || '<div class="empty">Нет событий за период</div>';
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
    obList.innerHTML = items.map(it => `
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
  
  // Update provider statuses
  updateProviderStatuses();
  updateIntegrationStatuses();
}

async function updateProviderStatuses() {
  const orStatus = document.getElementById('status-openrouter');
  if (orStatus) {
    if (settings.OPENROUTER_ENABLED === true || settings.OPENROUTER_ENABLED === 'true') {
        orStatus.className = 'status-badge active';
        orStatus.innerHTML = '<div class="status-dot"></div> Подключено';
    } else {
        orStatus.className = 'status-badge';
        orStatus.innerHTML = '<div class="status-dot"></div> Не активно';
    }
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
}

async function updateIntegrationStatuses() {
    const smtpStatus = document.getElementById('status-smtp');
    if (smtpStatus) {
        if (settings.SMTP_ENABLED === true || settings.SMTP_ENABLED === 'true') {
            smtpStatus.className = 'status-badge active';
            smtpStatus.innerHTML = '<div class="status-dot"></div> Активен';
        } else {
            smtpStatus.className = 'status-badge';
            smtpStatus.innerHTML = '<div class="status-dot"></div> Выключен';
        }
    }

    const supaStatus = document.getElementById('status-supabase');
    if (supaStatus) {
        if (settings.SUPABASE_URL) {
            supaStatus.className = 'status-badge active';
            supaStatus.innerHTML = '<div class="status-dot"></div> Настроено';
        } else {
            supaStatus.className = 'status-badge';
            supaStatus.innerHTML = '<div class="status-dot"></div> Ошибка';
        }
    }
}

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
  alert('Настройки сохранены');
  loadSettings();
}

async function testProviderConnection() {
  const res = await apiFetch('/ai/test', { 
    method: 'POST', 
    body: JSON.stringify({ provider: activeProviderConfig }) 
  });
  if (res.success) {
    alert('Связь установлена! Провайдер ответил успешно.');
  } else {
    alert('Ошибка связи: ' + res.error);
  }
}

function openSmtpConfig() {
    const panel = document.getElementById('integration-config-panel');
    panel.classList.remove('hidden');
    document.getElementById('integration-config-title').textContent = 'Настройка SMTP';
    document.getElementById('integration-config-form').innerHTML = `
      <div class="form-group">
        <label class="form-label">Включить уведомления</label>
        <select class="form-input" id="cfg-smtp-enabled">
          <option value="true" ${settings.SMTP_ENABLED === true || settings.SMTP_ENABLED === 'true' ? 'selected' : ''}>Да</option>
          <option value="false" ${settings.SMTP_ENABLED === false || settings.SMTP_ENABLED === 'false' ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">SMTP Host</label>
        <input type="text" class="form-input" id="cfg-smtp-host" value="${settings.SMTP_HOST || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Port</label>
        <input type="number" class="form-input" id="cfg-smtp-port" value="${settings.SMTP_PORT || 465}">
      </div>
      <div class="form-group">
        <label class="form-label">User (Login)</label>
        <input type="text" class="form-input" id="cfg-smtp-user" value="${settings.SMTP_USER || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input type="password" class="form-input" id="cfg-smtp-pass" placeholder="${settings.SMTP_PASSWORD === 'configured' ? '********' : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Email админа (получатель)</label>
        <input type="email" class="form-input" id="cfg-smtp-admin" value="${settings.ADMIN_NOTIFICATION_EMAIL || ''}">
      </div>
    `;
}

async function saveIntegrationSettings() {
    const update = {
        SMTP_ENABLED: document.getElementById('cfg-smtp-enabled').value === 'true',
        SMTP_HOST: document.getElementById('cfg-smtp-host').value,
        SMTP_PORT: document.getElementById('cfg-smtp-port').value,
        SMTP_USER: document.getElementById('cfg-smtp-user').value,
        SMTP_PASSWORD: document.getElementById('cfg-smtp-pass').value,
        ADMIN_NOTIFICATION_EMAIL: document.getElementById('cfg-smtp-admin').value,
    };
    await apiFetch('/settings', { method: 'POST', body: JSON.stringify(update) });
    alert('Интеграция сохранена');
    loadSettings();
}

async function testIntegrationConnection() {
    const res = await apiFetch('/smtp/test', { method: 'POST' });
    if (res.success) {
        alert('SMTP тест пройден! Проверьте почту.');
    } else {
        alert('Ошибка SMTP: ' + res.error);
    }
}

async function saveGeneralSettings() {
    const update = {
        AI_PROVIDER: document.getElementById('setting-ai-provider').value,
        PUBLIC_BASE_URL: document.getElementById('setting-public-url').value
    };
    await apiFetch('/settings', { method: 'POST', body: JSON.stringify(update) });
    alert('Общие настройки сохранены');
    loadSettings();
}

// --- Conversations ---
async function loadConversations() {
  const convs = await apiFetch('/conversations');
  const container = document.getElementById('conv-list-container');
  if (Array.isArray(convs)) {
    container.innerHTML = convs.map(c => `
      <div class="conv-item ${currentConversationId === c.id ? 'active' : ''}" onclick="openConversation('${c.id}')">
        <div class="conv-item-name">${c.guest_name}</div>
        <div class="conv-item-meta">${c.channel} | ${new Date(c.updated_at).toLocaleString()}</div>
      </div>
    `).join('') || '<div class="empty">Нет диалогов</div>';
  }
}

async function openConversation(id) {
  currentConversationId = id;
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  
  const conv = await apiFetch('/conversations/' + id);
  const chatMessages = document.getElementById('chat-messages');
  document.getElementById('chat-header').textContent = conv.guest_name;
  document.getElementById('chat-input-area').classList.remove('hidden');
  
  if (conv.messages) {
    chatMessages.innerHTML = conv.messages.map(m => `
      <div class="msg msg-${m.role}">
        <div class="msg-text">${m.text}</div>
        <div class="msg-time">${new Date(m.created_at).toLocaleTimeString()}</div>
      </div>
    `).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message || !currentConversationId) return;
  
  input.value = '';
  await apiFetch('/conversations/' + currentConversationId + '/messages', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
  
  openConversation(currentConversationId);
}

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
async function loadKBStatus() {
  const status = await apiFetch('/kb/status');
  const info = document.getElementById('kb-status-info');
  info.innerHTML = `
    <div>Всего чанков: <b>${status.totalChunks}</b></div>
    <div>Источников: <b>${status.sources ? status.sources.length : 0}</b></div>
    <div>Последнее обновление: <b>${new Date(status.lastUpdated).toLocaleString()}</b></div>
  `;
}

async function reloadKB() {
  const res = await apiFetch('/kb/reload', { method: 'POST' });
  if (res.success) {
    alert('База знаний успешно обновлена');
    loadKBStatus();
  }
}

// --- Test Chat ---
async function sendTestMessage() {
  const input = document.getElementById('test-input');
  const message = input.value.trim();
  if (!message) return;
  
  const container = document.getElementById('test-messages');
  container.innerHTML += '<div class="msg msg-guest"><div class="msg-text">' + message + '</div></div>';
  input.value = '';
  container.scrollTop = container.scrollHeight;
  
  const res = await apiFetch('/conversations/test-session/messages', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
  
  container.innerHTML += '<div class="msg msg-assistant"><div class="msg-text">' + res.reply + '</div></div>';
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
