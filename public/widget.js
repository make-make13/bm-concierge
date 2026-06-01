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

  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      inputEl.focus();
    }
  }

  button.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  function addMessage(text, role) {
    const msgEl = document.createElement('div');
    msgEl.className = 'bm-msg ' + (role === 'guest' ? 'bm-msg-guest' : 'bm-msg-assistant');
    msgEl.textContent = text;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
      }

      if (data.reply) {
        addMessage(data.reply, 'assistant');
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
