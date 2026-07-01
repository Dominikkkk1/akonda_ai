(function(){
'use strict';

var API_URL = 'https://akonda-chatbot-api.vercel.app/api/chat';
var CHAT_SECRET = '%%CHAT_SECRET%%'; // replaced during build/deploy
var WELCOME = 'Witaj! Jestem asystentem Akonda. Pomogę Ci dobrać odpowiednią maszynę introligatorską, ploter tnący lub drukarkę. W czym mogę pomóc?';

var messages = [];
var sessionData = null;
var isOpen = false;
var isStreaming = false;

// ── Build DOM ──
function init() {
  // Button
  var btn = document.createElement('button');
  btn.id = 'ak-chat-btn';
  btn.setAttribute('aria-label', 'Otwórz czat');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="ak-badge"></span>';
  document.body.appendChild(btn);

  // Window
  var win = document.createElement('div');
  win.id = 'ak-chat-window';
  win.innerHTML =
    '<div class="ak-chat-header">' +
      '<div class="ak-chat-header-left">' +
        '<div class="ak-chat-avatar"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>' +
        '<div class="ak-chat-header-info"><h4>Asystent Akonda</h4><p>Doradztwo maszyn poligraficznych</p></div>' +
      '</div>' +
      '<button class="ak-chat-close" id="ak-chat-close">&times;</button>' +
    '</div>' +
    '<div id="ak-chat-form" class="ak-chat-form">' +
      '<h5>Zanim zaczniemy — przedstaw się</h5>' +
      '<p>Dzięki temu nasi handlowcy będą mogli się z Tobą skontaktować.</p>' +
      '<input type="text" id="ak-f-name" placeholder="Imię i nazwisko *">' +
      '<input type="text" id="ak-f-company" placeholder="Nazwa firmy *">' +
      '<input type="tel" id="ak-f-phone" placeholder="Telefon *">' +
      '<input type="email" id="ak-f-email" placeholder="Email *">' +
      '<button class="ak-chat-form-btn" id="ak-f-submit">Rozpocznij rozmowę</button>' +
    '</div>' +
    '<div id="ak-chat-body" style="display:none;flex:1;display:none;flex-direction:column;overflow:hidden">' +
      '<div class="ak-chat-messages" id="ak-chat-messages"></div>' +
      '<div class="ak-chat-input">' +
        '<input type="text" id="ak-chat-msg" placeholder="Napisz wiadomość..." autocomplete="off">' +
        '<button id="ak-chat-send">Wyślij</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(win);

  // Events
  btn.addEventListener('click', toggleChat);
  document.getElementById('ak-chat-close').addEventListener('click', toggleChat);
  document.getElementById('ak-f-submit').addEventListener('click', submitForm);
  document.getElementById('ak-chat-send').addEventListener('click', sendMessage);
  document.getElementById('ak-chat-msg').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Check if session exists
  try {
    var saved = sessionStorage.getItem('ak_chat_session');
    if (saved) {
      var parsed = JSON.parse(saved);
      sessionData = parsed.data;
      messages = parsed.messages || [];
      showChat();
    }
  } catch(e) {}
}

function toggleChat() {
  isOpen = !isOpen;
  var win = document.getElementById('ak-chat-window');
  var badge = document.querySelector('#ak-chat-btn .ak-badge');
  if (isOpen) {
    win.classList.add('ak-open');
    if (badge) badge.style.display = 'none';
  } else {
    win.classList.remove('ak-open');
  }
}

function submitForm() {
  var name = document.getElementById('ak-f-name').value.trim();
  var company = document.getElementById('ak-f-company').value.trim();
  var phone = document.getElementById('ak-f-phone').value.trim();
  var email = document.getElementById('ak-f-email').value.trim();

  if (!name || !company || !phone || !email) {
    alert('Wypełnij wszystkie pola.');
    return;
  }

  sessionData = { name: name, company: company, phone: phone, email: email, url: location.href };

  // Save lead to WP backend
  if (typeof mkFront !== 'undefined' && mkFront.ajaxUrl) {
    var fd = new FormData();
    fd.append('action', 'mk_chatbot_start');
    fd.append('client_name', name);
    fd.append('client_company', company);
    fd.append('client_phone', phone);
    fd.append('client_email', email);
    fd.append('source_url', location.href);
    fetch(mkFront.ajaxUrl, { method: 'POST', body: fd }).catch(function(){});
  }

  saveSession();
  showChat();
}

function showChat() {
  document.getElementById('ak-chat-form').style.display = 'none';
  var body = document.getElementById('ak-chat-body');
  body.style.display = 'flex';

  // Render existing messages
  var container = document.getElementById('ak-chat-messages');
  container.innerHTML = '';

  // Welcome message
  if (messages.length === 0) {
    addBotMessage(WELCOME);
    messages.push({ role: 'assistant', content: WELCOME });
    saveSession();
  } else {
    messages.forEach(function(m) {
      if (m.role === 'user') addUserBubble(m.content);
      else addBotBubble(m.content);
    });
  }

  scrollToBottom();
}

function sendMessage() {
  if (isStreaming) return;
  var input = document.getElementById('ak-chat-msg');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';

  addUserBubble(text);
  messages.push({ role: 'user', content: text });
  saveSession();

  streamResponse();
}

function streamResponse() {
  isStreaming = true;
  var container = document.getElementById('ak-chat-messages');

  // Typing indicator
  var typing = document.createElement('div');
  typing.className = 'ak-typing ak-show';
  typing.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typing);
  scrollToBottom();

  // Prepare messages for API (only role + content, limit context)
  var apiMessages = messages.slice(-20).map(function(m) {
    return { role: m.role, content: m.content };
  });

  fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Chat-Secret': CHAT_SECRET
    },
    body: JSON.stringify({
      messages: apiMessages,
      sessionId: sessionData ? sessionData.email : 'anon'
    })
  }).then(function(response) {
    if (!response.ok) throw new Error('API error');
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var fullText = '';

    // Replace typing with bot bubble
    typing.remove();
    var bubble = document.createElement('div');
    bubble.className = 'ak-msg ak-msg-bot';
    container.appendChild(bubble);

    function read() {
      reader.read().then(function(result) {
        if (result.done) {
          finishStream(fullText, bubble);
          return;
        }
        var chunk = decoder.decode(result.value, { stream: true });
        var lines = chunk.split('\n');
        lines.forEach(function(line) {
          if (line.startsWith('data: ')) {
            var data = line.slice(6).trim();
            if (data === '[DONE]') {
              finishStream(fullText, bubble);
              return;
            }
            try {
              var parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                bubble.innerHTML = renderMarkdown(fullText);
                scrollToBottom();
              }
            } catch(e) {}
          }
        });
        read();
      }).catch(function() {
        finishStream(fullText || 'Przepraszam, wystąpił błąd. Spróbuj ponownie.', bubble);
      });
    }
    read();
  }).catch(function() {
    typing.remove();
    addBotMessage('Przepraszam, nie mogę się połączyć. Spróbuj ponownie za chwilę lub zadzwoń: 22 355 01 92');
    isStreaming = false;
  });
}

function finishStream(text, bubble) {
  bubble.innerHTML = renderMarkdown(text);
  messages.push({ role: 'assistant', content: text });
  saveSession();
  isStreaming = false;
  scrollToBottom();
}

function addUserBubble(text) {
  var container = document.getElementById('ak-chat-messages');
  var div = document.createElement('div');
  div.className = 'ak-msg ak-msg-user';
  div.textContent = text;
  container.appendChild(div);
  scrollToBottom();
}

function addBotBubble(text) {
  var container = document.getElementById('ak-chat-messages');
  var div = document.createElement('div');
  div.className = 'ak-msg ak-msg-bot';
  div.innerHTML = renderMarkdown(text);
  container.appendChild(div);
}

function addBotMessage(text) {
  addBotBubble(text);
}

function renderMarkdown(text) {
  // Simple markdown: bold, links, line breaks
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
}

function scrollToBottom() {
  var el = document.getElementById('ak-chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function saveSession() {
  try {
    sessionStorage.setItem('ak_chat_session', JSON.stringify({
      data: sessionData,
      messages: messages.slice(-30)
    }));
  } catch(e) {}
}

// Init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
