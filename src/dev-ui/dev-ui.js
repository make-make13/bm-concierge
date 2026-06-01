document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.view-section');
  const topbarTitle = document.getElementById('topbar-title-text');

  window.switchTab = (targetId) => {
    navItems.forEach(nav => {
      if (nav.dataset.target === targetId) {
        nav.classList.add('active');
        topbarTitle.textContent = nav.textContent.trim();
      } else {
        nav.classList.remove('active');
      }
    });

    sections.forEach(sec => {
      if (sec.id === targetId) sec.classList.add('active');
      else sec.classList.remove('active');
    });

    if (targetId === 'home') refreshStatuses();
    if (targetId === 'knowledge') refreshKnowledgeStatus();
    if (targetId === 'connections' || targetId === 'supabase') refreshConfigStatus();
  };

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(item.dataset.target);
    });
  });

  // Simple Frontend Logger
  const logsContainer = document.getElementById('frontend-logs');
  window.addLog = (message, type = 'info', data = null) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    let logHtml = `<div class="log-entry">
      <span class="log-time">[${time}]</span>
      <span class="log-type-${type}">[${type.toUpperCase()}]</span> 
      <span>${message}</span>`;
    
    if (data) {
      logHtml += `<br><pre style="margin:0.25rem 0 0 0; color:var(--text-muted);">${JSON.stringify(data, null, 2)}</pre>`;
    }
    logHtml += `</div>`;
    
    if (logsContainer) {
      logsContainer.insertAdjacentHTML('afterbegin', logHtml);
    }
    console.log(`[${time}] [${type.toUpperCase()}] ${message}`, data || '');
  };

  document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
    if (logsContainer) logsContainer.innerHTML = '';
  });

  // API calls
  async function refreshStatuses() {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        document.getElementById('home-backend-status').textContent = 'В сети';
        document.getElementById('home-backend-status').closest('.stat-card').querySelector('.stat-icon').className = 'stat-icon connected';
      } else {
        throw new Error('Not ok');
      }
    } catch {
      document.getElementById('home-backend-status').textContent = 'Ошибка';
      document.getElementById('home-backend-status').closest('.stat-card').querySelector('.stat-icon').className = 'stat-icon warning';
    }

    refreshConfigStatus();
    refreshKnowledgeStatus();
  }

  async function refreshConfigStatus() {
    try {
      const res = await fetch('/api/dev/config/status');
      const data = await res.json();
      
      // Update form
      document.getElementById('SUPABASE_LEADS_TABLE').value = data.supabase.table || 'leads';
      document.getElementById('AI_PROVIDER').value = data.aiProvider || 'mock';
      
      const keyStatus = document.getElementById('key-configured-status');
      if (data.supabase.serviceRoleKeyConfigured) {
        keyStatus.textContent = 'настроен';
        keyStatus.style.color = 'var(--success)';
      } else {
        keyStatus.textContent = 'не настроен';
        keyStatus.style.color = 'var(--warning)';
      }

      // Update Home stats
      const sbIcon = document.getElementById('home-supabase-status').closest('.stat-card').querySelector('.stat-icon');
      if (data.supabase.urlConfigured && data.supabase.serviceRoleKeyConfigured) {
        document.getElementById('home-supabase-status').textContent = 'Подключено';
        sbIcon.className = 'stat-icon connected';
      } else {
        document.getElementById('home-supabase-status').textContent = 'Не настроено';
        sbIcon.className = 'stat-icon neutral';
      }
      
      document.getElementById('home-ai-provider').textContent = data.aiProvider;
      document.getElementById('home-ai-provider').closest('.stat-card').querySelector('.stat-icon').className = 'stat-icon connected';

      // Update Connections stats
      const connSbStatus = document.getElementById('conn-supabase-status');
      if (connSbStatus) {
        if (data.supabase.urlConfigured && data.supabase.serviceRoleKeyConfigured) {
          connSbStatus.className = 'conn-status connected';
          connSbStatus.innerHTML = '<span class="dot"></span> Подключено';
        } else {
          connSbStatus.className = 'conn-status disconnected';
          connSbStatus.innerHTML = '<span class="dot"></span> Не настроено';
        }
      }

    } catch (err) {
      addLog('Не удалось получить статус конфигурации', 'error');
    }
  }

  async function refreshKnowledgeStatus() {
    try {
      const res = await fetch('/api/dev/knowledge/status');
      const data = await res.json();
      
      document.getElementById('kb-files-count').textContent = data.files.length;
      document.getElementById('kb-chunks-count').textContent = data.totalChunks;
      
      document.getElementById('home-kb-status').textContent = `${data.files.length} файлов`;
      document.getElementById('home-kb-status').closest('.stat-card').querySelector('.stat-icon').className = 'stat-icon connected';

      const list = document.getElementById('kb-file-list');
      if (list) {
        list.innerHTML = '';
        data.files.forEach(f => {
          list.insertAdjacentHTML('beforeend', `
            <li>
              <span>📄 ${f.name}</span>
              <span style="color:var(--text-muted); font-size:0.8rem">${f.chunks} чанков</span>
            </li>
          `);
        });
      }
    } catch (err) {
      document.getElementById('home-kb-status').textContent = 'Ошибка';
      addLog('Не удалось получить статус базы знаний', 'error');
    }
  }

  // Event Listeners for actions
  document.getElementById('btn-quick-supabase')?.addEventListener('click', () => switchTab('supabase'));
  document.getElementById('btn-quick-lead')?.addEventListener('click', () => {
    switchTab('supabase');
    document.getElementById('btn-test-supabase').click();
  });
  document.getElementById('btn-quick-reload-kb')?.addEventListener('click', async () => {
    addLog('Перезагрузка базы знаний...', 'info');
    try {
      const res = await fetch('/api/dev/knowledge/reload', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addLog('База знаний успешно перезагружена', 'success', data.status);
        refreshKnowledgeStatus();
      } else {
        addLog('Ошибка перезагрузки базы знаний', 'error', data);
      }
    } catch (err) {
      addLog('Ошибка сети при перезагрузке БЗ', 'error', { error: err.message });
    }
  });
  
  document.getElementById('btn-reload-kb')?.addEventListener('click', async () => {
    document.getElementById('btn-quick-reload-kb').click();
  });

  // Config Form
  document.getElementById('config-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    
    const url = document.getElementById('SUPABASE_URL').value;
    const key = document.getElementById('SUPABASE_SERVICE_ROLE_KEY').value;
    const table = document.getElementById('SUPABASE_LEADS_TABLE').value;
    const ai = document.getElementById('AI_PROVIDER').value;
    
    if (url) payload.SUPABASE_URL = url;
    if (key) payload.SUPABASE_SERVICE_ROLE_KEY = key;
    if (table) payload.SUPABASE_LEADS_TABLE = table;
    if (ai) payload.AI_PROVIDER = ai;
    
    const statusEl = document.getElementById('config-save-status');
    statusEl.textContent = 'Сохранение...';
    
    try {
      const res = await fetch('/api/dev/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        statusEl.textContent = 'Сохранено!';
        statusEl.style.color = 'var(--success)';
        addLog('Настройки сохранены', 'success', payload);
        document.getElementById('SUPABASE_SERVICE_ROLE_KEY').value = '';
        refreshStatuses();
      } else {
        statusEl.textContent = 'Ошибка';
        statusEl.style.color = 'var(--error)';
        addLog('Ошибка при сохранении настроек', 'error', data);
      }
    } catch (err) {
      statusEl.textContent = 'Ошибка сети';
      statusEl.style.color = 'var(--error)';
      addLog('Ошибка сети при сохранении', 'error', { error: err.message });
    }
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  });

  // Chat Test
  document.querySelectorAll('.btn-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('chat-message').value = btn.dataset.msg;
    });
  });

  document.getElementById('btn-send-chat')?.addEventListener('click', async () => {
    const payload = {
      message: document.getElementById('chat-message').value,
      channel: document.getElementById('chat-channel').value,
      guestName: document.getElementById('chat-guest-name').value,
      guestContact: document.getElementById('chat-guest-contact').value
    };
    
    document.getElementById('chat-reply-text').textContent = 'Обработка...';
    document.getElementById('chat-test-output').textContent = '{}';
    addLog('Отправка сообщения в чат', 'info', payload);
    
    try {
      const res = await fetch('/api/chat/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      document.getElementById('chat-reply-text').textContent = data.reply || 'Нет ответа';
      document.getElementById('chat-test-output').textContent = JSON.stringify(data, null, 2);
      
      if (res.ok) addLog('Ответ получен', 'success', data);
      else addLog('Ошибка логики чата', 'warn', data);
      
    } catch (err) {
      document.getElementById('chat-reply-text').textContent = 'Ошибка соединения';
      addLog('Ошибка сети при отправке чата', 'error', { error: err.message });
    }
  });

  // Supabase Test
  document.getElementById('btn-test-supabase')?.addEventListener('click', async () => {
    const outEl = document.getElementById('supabase-test-output');
    outEl.style.display = 'block';
    outEl.textContent = 'Отправка...';
    addLog('Запуск прямого теста Supabase', 'info');
    
    try {
      const res = await fetch('/api/dev/supabase/test', { method: 'POST' });
      const data = await res.json();
      outEl.textContent = JSON.stringify(data, null, 2);
      
      if (res.ok && !data.error) addLog('Тест Supabase успешен', 'success', data);
      else addLog('Тест Supabase завершился с ошибкой', 'error', data);
      
    } catch (err) {
      outEl.textContent = JSON.stringify({ error: err.message }, null, 2);
      addLog('Сбой при тесте Supabase', 'error', { error: err.message });
    }
  });

  // Init
  refreshStatuses();
  addLog('Dev UI загружен и инициализирован', 'info');
});
