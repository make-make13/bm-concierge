(function() {
  // Styles for the widget
  const styles = `
    #bm-chat-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: 'Inter', 'Roboto', sans-serif;
    }
    #bm-chat-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #1a1a1a;
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    }
    #bm-chat-button:hover {
      transform: scale(1.05);
    }
    #bm-chat-button svg {
      width: 30px;
      height: 30px;
      fill: currentColor;
    }
    .bm-msg-operator {
      align-self: flex-start;
      background: #e8f5e9;
      color: #1b5e20;
      border: 1px solid #a5d6a7;
    }
    .bm-msg-operator-label {
      font-size: 10px;
      font-weight: 700;
      color: #388e3c;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    #bm-chat-window {
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 350px;
      height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #eaeaea;
    }
    #bm-chat-header {
      background: #1a1a1a;
      color: white;
      padding: 15px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #bm-chat-close {
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
    }
    #bm-chat-messages {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      background: #f9f9f9;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bm-msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
      word-wrap: break-word;
    }
    .bm-msg-assistant {
      align-self: flex-start;
      background: white;
      border: 1px solid #eaeaea;
      color: #333;
      border-bottom-left-radius: 2px;
    }
    .bm-msg-guest {
      align-self: flex-end;
      background: #1a1a1a;
      color: white;
      border-bottom-right-radius: 2px;
    }
    .bm-msg-typing {
      align-self: flex-start;
      background: transparent;
      color: #888;
      font-size: 12px;
      font-style: italic;
    }
    #bm-chat-input-container {
      display: flex;
      padding: 10px;
      background: white;
      border-top: 1px solid #eaeaea;
    }
    #bm-chat-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #ccc;
      border-radius: 20px;
      outline: none;
      font-size: 14px;
    }
    #bm-chat-input:focus {
      border-color: #1a1a1a;
    }
    #bm-chat-send {
      background: #1a1a1a;
      color: white;
      border: none;
      border-radius: 20px;
      padding: 0 15px;
      margin-left: 8px;
      cursor: pointer;
      font-weight: bold;
    }
    #bm-chat-send:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    @media (max-width: 400px) {
      #bm-chat-window {
        width: calc(100vw - 40px);
        height: calc(100vh - 120px);
      }
    }
  `;

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.innerHTML = styles;
  document.head.appendChild(styleEl);

  // Create widget DOM
  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'bm-chat-widget';
  
  widgetContainer.innerHTML = `
    <div id="bm-chat-window">
      <div id="bm-chat-header">
        <span>Консьерж</span>
        <span id="bm-chat-close">&times;</span>
      </div>
      <div id="bm-chat-messages">
        <div class="bm-msg bm-msg-assistant">Здравствуйте! Я — онлайн-консьерж бутик-отеля «Большая Медведица». Чем могу помочь?</div>
      </div>
      <div id="bm-chat-input-container">
        <input type="text" id="bm-chat-input" placeholder="Введите сообщение..." />
        <button id="bm-chat-send">Отправить</button>
      </div>
    </div>
    <button id="bm-chat-button" aria-label="Открыть чат">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    </button>
  `;
  
  document.body.appendChild(widgetContainer);

  // Logic
  const button = document.getElementById('bm-chat-button');
  const chatWindow = document.getElementById('bm-chat-window');
  const closeBtn = document.getElementById('bm-chat-close');
  const messagesContainer = document.getElementById('bm-chat-messages');
  const inputEl = document.getElementById('bm-chat-input');
  const sendBtn = document.getElementById('bm-chat-send');

  let isOpen = false;

  // Try to get session ID from localStorage
  let sessionId = localStorage.getItem('bm_chat_session_id');

  // Polling state: cursor and de-dupe set
  let lastOperatorCursor = '';        // ISO-дата последнего полученного operator-сообщения
  const seenMessageIds = new Set();   // de-dupe по id
  let pollingTimer = null;

  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      inputEl.focus();
      startPolling();
      void pollOperatorMessages(); // немедленный poll при открытии
    } else {
      stopPolling();
    }
  }

  button.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  function addMessage(text, role, msgId) {
    if (!text || !text.trim()) return;  // не рисовать пустые пузыри
    if (msgId && seenMessageIds.has(msgId)) return;  // de-dupe
    if (msgId) seenMessageIds.add(msgId);

    const msgEl = document.createElement('div');
    if (role === 'guest') {
      msgEl.className = 'bm-msg bm-msg-guest';
    } else if (role === 'operator') {
      msgEl.className = 'bm-msg bm-msg-operator';
    } else {
      msgEl.className = 'bm-msg bm-msg-assistant';
    }

    if (role === 'operator') {
      const label = document.createElement('div');
      label.className = 'bm-msg-operator-label';
      label.textContent = 'Администратор';
      msgEl.appendChild(label);
    }

    const textNode = document.createElement('div');
    textNode.textContent = text;
    msgEl.appendChild(textNode);

    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Polling: запрашиваем operator-сообщения пока чат открыт
  async function pollOperatorMessages() {
    if (!sessionId || !isOpen) return;
    try {
      const url = `${window.location.origin}/api/chat/web/messages?sessionId=${encodeURIComponent(sessionId)}&after=${encodeURIComponent(lastOperatorCursor)}`;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const data = await resp.json();
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        for (const msg of data.messages) {
          if (msg.text && msg.text.trim()) {
            addMessage(msg.text, 'operator', msg.id);
            // обновляем cursor на самое позднее сообщение
            if (!lastOperatorCursor || (msg.createdAt && msg.createdAt > lastOperatorCursor)) {
              lastOperatorCursor = msg.createdAt || '';
            }
          }
        }
      }
    } catch { /* тихий fail — не прерывать UX */ }
  }

  function startPolling() {
    if (pollingTimer) return;
    pollingTimer = setInterval(pollOperatorMessages, 5000);
  }

  function stopPolling() {
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  }

  function addTypingIndicator() {
    const msgEl = document.createElement('div');
    msgEl.className = 'bm-msg bm-msg-typing';
    msgEl.id = 'bm-chat-typing';
    msgEl.textContent = 'Консьерж печатает...';
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('bm-chat-typing');
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    // UI update
    inputEl.value = '';
    addMessage(text, 'guest');
    addTypingIndicator();
    
    inputEl.disabled = true;
    sendBtn.disabled = true;

    try {
      const apiUrl = `${window.location.origin}/api/chat/web`; // Works since it's served from the same host, or can be absolute
      
      const payload = {
        message: text,
        pageUrl: window.location.href,
        referrer: document.referrer
      };

      if (sessionId) {
        payload.sessionId = sessionId;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      removeTypingIndicator();

      if (data.sessionId && !sessionId) {
        sessionId = data.sessionId;
        localStorage.setItem('bm_chat_session_id', sessionId);
        startPolling(); // стартуем polling как только получили sessionId
      }

      if (data.aiSkipped) {
        // ИИ молчит (manual_mode) — ждём ответа администратора через polling
        void pollOperatorMessages();
      } else if (data.reply) {
        addMessage(data.reply, 'assistant');
        void pollOperatorMessages(); // проверяем и operator-сообщения после AI-ответа
      } else if (data.error) {
        addMessage('Ошибка: ' + data.error, 'assistant');
      }
    } catch (err) {
      removeTypingIndicator();
      console.error('[WebChat] send failed', err); addMessage('Не удалось отправить сообщение. Пожалуйста, проверьте подключение.', 'assistant');
    } finally {
      inputEl.disabled = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

})();
