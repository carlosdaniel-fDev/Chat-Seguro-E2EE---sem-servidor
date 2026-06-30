// ============================================================
// Chat Seguro E2EE — versão 100% P2P com PeerJS
// O ID técnico de conexão é gerado automaticamente pelo PeerJS
// (evita conflitos de "ID já em uso"). O apelido é só um nome de
// exibição, separado do ID técnico.
// Não existe back-end próprio: o único servidor envolvido é o
// broker público e gratuito do PeerJS, usado apenas para os dois
// navegadores trocarem os dados necessários para abrir a conexão
// WebRTC direta (sinalização). Nenhuma mensagem passa por lá.
// Por cima do canal P2P (já criptografado via DTLS), aplicamos
// uma camada extra de E2EE (ECDH + AES-GCM) via Web Crypto API.
// ============================================================

let peer = null;
let conn = null;
let keyPair = null;
let sharedKey = null;

let myPeerId = null;     // ID técnico, gerado pelo PeerJS
let myNickname = '';     // Nome de exibição, escolhido pelo usuário
let peerNickname = null;
let roomPassword = '';
let turn = null;          // guarda o NICKNAME de quem tem a vez
let isInitiator = false;
let darkMode = false;

// ---------- DOM ----------
const entryScreen = document.getElementById('entry-screen');
const chatScreen = document.getElementById('chat-screen');
const entryForm = document.getElementById('entry-form');
const myIdInput = document.getElementById('my-id-input');
const peerIdInput = document.getElementById('peer-id-input');
const roomPasswordInput = document.getElementById('room-password-input');
const entryError = document.getElementById('entry-error');
const joinBtn = document.getElementById('join-btn');
const rerollBtn = document.getElementById('reroll-btn');
const invitebannerEl = document.getElementById('invite-banner');
const darkToggle = document.getElementById('dark-mode-toggle');
const darkToggle2 = document.getElementById('dark-toggle-2');

const peerAvatar = document.getElementById('peer-avatar');
const peerNameEl = document.getElementById('peer-name');
const peerStatusEl = document.getElementById('peer-status');
const turnBanner = document.getElementById('turn-banner');
const messagesArea = document.getElementById('messages-area');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const passBtn = document.getElementById('pass-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPopover = document.getElementById('emoji-popover');
const copyLinkBtn2 = document.getElementById('copy-link-btn-2');

// ---------- Utilidades ----------
function generateMessageId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function extractPeerIdFromInput(raw) {
  const value = (raw || '').trim();
  if (!value) return '';
  // Aceita tanto um link colado (?to=XXXX) quanto o ID puro.
  try {
    const url = new URL(value);
    const fromParam = url.searchParams.get('to');
    if (fromParam) return fromParam;
  } catch (e) {
    // não é uma URL, segue como ID puro
  }
  return value;
}

function applyDarkMode() {
  document.body.classList.toggle('dark', darkMode);
  entryScreen.classList.toggle('dark', darkMode);
  chatScreen.classList.toggle('dark', darkMode);
}

function showError(msg) {
  entryError.textContent = msg;
  entryError.style.display = 'block';
}

function clearError() {
  entryError.style.display = 'none';
}

// ---------- Link de convite (só existe depois de conectar ao broker) ----------
function getInviteLink() {
  if (!myPeerId) return null;
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('to', myPeerId);
  return url.toString();
}

async function copyInviteLinkToClipboard(btnEl) {
  const link = getInviteLink();
  if (!link) {
    showError('Aguarde a conexão ser estabelecida antes de copiar o link.');
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
  } catch (e) {
    window.prompt('Copie o link abaixo:', link);
    return;
  }
  if (btnEl) {
    const original = btnEl.textContent;
    btnEl.textContent = '✅';
    setTimeout(() => { btnEl.textContent = original; }, 2000);
  }
}

copyLinkBtn2.addEventListener('click', () => copyInviteLinkToClipboard(copyLinkBtn2));

// Pré-preenche o campo de ID se veio de um link de convite (?to=)
(function checkInviteParam() {
  const params = new URLSearchParams(window.location.search);
  const invitedBy = params.get('to');
  if (invitedBy) {
    peerIdInput.value = invitedBy;
    invitebannerEl.style.display = 'block';
    invitebannerEl.textContent = 'Você recebeu um convite — clique em "Entrar no chat" para conectar 🎉';
  }
})();

myIdInput.value = generateNickname();
rerollBtn.addEventListener('click', () => { myIdInput.value = generateNickname(); });

darkToggle.addEventListener('change', (e) => { darkMode = e.target.checked; applyDarkMode(); });
darkToggle2.addEventListener('click', () => { darkMode = !darkMode; darkToggle.checked = darkMode; applyDarkMode(); });

// ---------- Entrada na sala ----------
entryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  myNickname = (myIdInput.value || '').trim() || generateNickname();
  myIdInput.value = myNickname;
  roomPassword = roomPasswordInput.value || '';

  const targetPeerId = extractPeerIdFromInput(peerIdInput.value);
  const wantsToConnect = !!targetPeerId;

  joinBtn.disabled = true;
  joinBtn.textContent = 'Conectando...';

  // Não passamos um ID customizado: o PeerJS gera um ID técnico único
  // automaticamente, evitando o erro "ID já em uso" (unavailable-id).
  peer = new Peer({ debug: 1 });

  peer.on('open', (id) => {
    myPeerId = id;
    showChatScreen();

    if (wantsToConnect) {
      initiateConnection(targetPeerId);
    } else {
      peerStatusEl.textContent = 'Aguardando outro usuário entrar...';
      turnBanner.textContent = '⏳ Aguardando conexão para iniciar';
    }
  });

  peer.on('connection', (incomingConn) => {
    handleIncomingConnection(incomingConn);
  });

  peer.on('error', (err) => {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Entrar no chat';
    if (err.type === 'peer-unavailable') {
      addSystemMessageOrError('O outro usuário não está online agora. Peça para ele abrir o app/link primeiro e ficar esperando.');
    } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
      showError('Não foi possível conectar ao servidor de sinalização. Verifique sua internet e tente novamente.');
    } else {
      showError('Erro de conexão: ' + err.type);
    }
  });
});

function addSystemMessageOrError(text) {
  if (chatScreen.style.display === 'none') {
    showError(text);
  } else {
    addSystemMessage(text);
  }
}

function initiateConnection(targetId) {
  if (conn) return; // já conectado
  isInitiator = true;
  const dataConn = peer.connect(targetId, {
    reliable: true,
    metadata: { nickname: myNickname, password: roomPassword },
  });
  setupConnection(dataConn, true);
}

function handleIncomingConnection(incomingConn) {
  if (conn && conn.peer === incomingConn.peer) {
    incomingConn.close();
    return;
  }
  const theirPassword = incomingConn.metadata?.password || '';
  if (roomPassword && theirPassword !== roomPassword) {
    incomingConn.on('open', () => {
      incomingConn.send({ type: 'error', message: 'Senha incorreta.' });
      setTimeout(() => incomingConn.close(), 500);
    });
    return;
  }
  isInitiator = false;
  setupConnection(incomingConn, false);
}

// ---------- Conexão / E2EE / Turnos ----------
async function setupConnection(dataConn, initiator) {
  conn = dataConn;

  conn.on('open', async () => {
    peerNickname = conn.metadata?.nickname || conn.peer;
    showChatScreen();
    updatePeerHeader();
    addSystemMessage(`Usuário ${peerNickname} entrou no chat`);

    keyPair = await generateKeyPair();
    const jwk = await exportPublicKeyJwk(keyPair);
    conn.send({ type: 'public-key', jwk, nickname: myNickname });

    if (!initiator) {
      // Quem estava esperando (não iniciou a conexão) começa com a vez,
      // igual ao comportamento original: primeiro a entrar tem a vez.
      turn = myNickname;
      conn.send({ type: 'turn-init', turn: myNickname });
      updateTurnUI();
    }
  });

  conn.on('data', handleData);

  conn.on('close', () => {
    addSystemMessage(`Usuário ${peerNickname || ''} saiu do chat`);
    peerStatusEl.textContent = 'Offline';
    setTyping(false);
    sharedKey = null;
    conn = null;
    turn = null;
    updateTurnUI();
    updateInputState();
  });

  conn.on('error', (err) => {
    console.error('Erro na conexão P2P:', err);
  });
}

async function handleData(data) {
  switch (data.type) {
    case 'public-key': {
      if (!peerNickname) peerNickname = data.nickname;
      updatePeerHeader();
      const peerPublicKey = await importPublicKeyJwk(data.jwk);
      sharedKey = await deriveSharedKey(keyPair.privateKey, peerPublicKey);
      peerStatusEl.textContent = '🔒 Criptografado';
      break;
    }
    case 'turn-init': {
      turn = data.turn;
      updateTurnUI();
      break;
    }
    case 'release-turn':
    case 'pass-turn': {
      // Aceita tanto 'release-turn' quanto 'pass-turn' para compatibilidade
      const newTurn = data.newTurn || data.turn;
      if (!newTurn) {
        console.warn('Comando de liberação recebido, mas sem newTurn/turn');
        break;
      }
      
      // Validação: o novo turn deve ser um nickname válido
      if (newTurn !== myNickname && newTurn !== peerNickname) {
        console.warn('Turn inválido recebido:', newTurn);
        break;
      }
      
      turn = newTurn;
      console.log(`[DEBUG] Vez passou para: ${turn}`);
      addSystemMessage(`⏳ Agora é a vez de ${turn}`);
      updateTurnUI();
      break;
    }
    case 'message': {
      if (!sharedKey) return;
      try {
        const text = await decryptMessage(sharedKey, data.ciphertext, data.iv);
        addMessage(peerNickname, text, false, data.id);
        // Confirma que a mensagem foi visualizada (estilo "✓✓ visto").
        if (data.id && conn) {
          conn.send({ type: 'seen', id: data.id });
        }
      } catch (e) {
        console.error('Falha ao descriptografar', e);
      }
      break;
    }
    case 'seen': {
      markMessageAsSeen(data.id);
      break;
    }
    case 'typing': {
      setTyping(data.isTyping);
      break;
    }
    case 'error': {
      addSystemMessage('Erro: ' + data.message);
      break;
    }
    default:
      break;
  }
}

// ---------- UI: tela de chat ----------
function showChatScreen() {
  entryScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
}

function updatePeerHeader() {
  peerNameEl.textContent = peerNickname || 'Aguardando usuário...';
  peerAvatar.textContent = (peerNickname || '?')[0].toUpperCase();
  if (!peerStatusEl.textContent || peerStatusEl.textContent === 'Offline') {
    peerStatusEl.textContent = 'Estabelecendo conexão segura...';
  }
}

function updateTurnUI() {
  const isMyTurn = turn === myNickname;
  if (turn) {
    turnBanner.textContent = isMyTurn ? '✅ É a sua vez de digitar' : `⏳ É a vez de ${turn}`;
    turnBanner.className = 'turn-banner ' + (isMyTurn ? 'my-turn' : 'their-turn');
  } else {
    turnBanner.textContent = '⏳ Aguardando conexão para iniciar';
    turnBanner.className = 'turn-banner their-turn';
  }
  updateInputState();
}

function updateInputState() {
  const isMyTurn = turn === myNickname && !!conn;
  textInput.disabled = !isMyTurn;
  sendBtn.disabled = !isMyTurn || !textInput.value.trim();
  passBtn.disabled = !isMyTurn;
  textInput.placeholder = isMyTurn ? 'Digite uma mensagem' : 'Aguarde sua vez para digitar...';
}

function setTyping(isTyping) {
  const base = conn ? (sharedKey ? '🔒 Criptografado' : 'Estabelecendo conexão segura...') : 'Offline';
  peerStatusEl.textContent = isTyping ? base + ' · digitando...' : base;
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'system-msg';
  el.textContent = text;
  messagesArea.appendChild(el);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function addMessage(from, text, mine, messageId) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (mine ? 'mine' : 'theirs');
  if (messageId) bubble.dataset.msgId = messageId;

  const textEl = document.createElement('div');
  textEl.className = 'bubble-text';
  textEl.textContent = text;

  const timeRow = document.createElement('div');
  timeRow.className = 'bubble-time';
  timeRow.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (mine) {
    const check = document.createElement('span');
    check.className = 'msg-check';
    check.textContent = '✓';
    timeRow.appendChild(check);
  }

  bubble.appendChild(textEl);
  bubble.appendChild(timeRow);
  messagesArea.appendChild(bubble);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function markMessageAsSeen(messageId) {
  if (!messageId) return;
  const bubble = messagesArea.querySelector(`.bubble[data-msg-id="${messageId}"]`);
  if (!bubble) return;
  const check = bubble.querySelector('.msg-check');
  if (check) {
    check.textContent = '✓✓';
    check.classList.add('read');
  }
}

// ---------- Envio de mensagens ----------
async function sendMessage() {
  const text = textInput.value.trim();
  if (!text || turn !== myNickname || !sharedKey || !conn) return;
  const { ciphertext, iv } = await encryptMessage(sharedKey, text);
  const id = generateMessageId();
  conn.send({ type: 'message', id, ciphertext, iv });
  addMessage(myNickname, text, true, id);
  textInput.value = '';
  conn.send({ type: 'typing', isTyping: false });
  updateInputState();
}

sendBtn.addEventListener('click', sendMessage);
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

let typingTimeout = null;
textInput.addEventListener('input', () => {
  updateInputState();
  if (!conn) return;
  conn.send({ type: 'typing', isTyping: textInput.value.length > 0 });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    conn.send({ type: 'typing', isTyping: false });
  }, 1500);
});

passBtn.addEventListener('click', () => {
  if (turn !== myNickname || !conn) return;
  
  // Calcula quem recebe a vez: sempre o outro usuário
  const newTurn = peerNickname;
  
  // Envia a mensagem oculta de liberação da vez
  // NÃO atualiza turn localmente - deixa o handleData fazer isso
  conn.send({ 
    type: 'release-turn',
    newTurn: newTurn,
    from: myNickname
  });
  
  console.log(`[DEBUG] Liberando vez para: ${newTurn}`);
  addSystemMessage(`✅ Você passou a vez para ${newTurn}`);
});

// ---------- Emojis ----------
const EMOJIS = ['😀','😂','😍','😎','🥳','😢','😡','👍','🙏','❤️','🔥','🎉','🤔','😴','👀','✅','💬','🚀','🙌','😅'];
EMOJIS.forEach((emoji) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'emoji-item';
  btn.textContent = emoji;
  btn.addEventListener('click', () => {
    textInput.value += emoji;
    updateInputState();
    textInput.focus();
  });
  emojiPopover.appendChild(btn);
});

emojiBtn.addEventListener('click', () => {
  emojiPopover.style.display = emojiPopover.style.display === 'none' ? 'grid' : 'none';
});
