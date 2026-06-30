// ---------- PWA install support ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBtn').style.display = 'inline-block';
  document.getElementById('installBtnLogin').style.display = 'block';
});

async function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installBtn').style.display = 'none';
  document.getElementById('installBtnLogin').style.display = 'none';
}

document.getElementById('installBtn').addEventListener('click', triggerInstall);
document.getElementById('installBtnLogin').addEventListener('click', triggerInstall);

window.addEventListener('appinstalled', () => {
  document.getElementById('installBtn').style.display = 'none';
  document.getElementById('installBtnLogin').style.display = 'none';
});

// Show a manual hint for iOS, which doesn't support the install prompt above
function isIos() {
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}
function isInStandaloneMode() {
  return ('standalone' in window.navigator) && window.navigator.standalone;
}
if (isIos() && !isInStandaloneMode()) {
  document.getElementById('iosInstallHint').style.display = 'block';
}

let myName = localStorage.getItem('chatapp_name') || null;
let socket = null;
let currentChatWith = null;
let onlineSet = new Set();
let typingTimeout = null;

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ---------- Login ----------
function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'flex';
  document.getElementById('myName').textContent = myName;
  connectSocket();
  loadContacts();
}

async function login(name) {
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Could not log in.';
      return;
    }
    myName = data.name;
    localStorage.setItem('chatapp_name', myName);
    showApp();
  } catch (err) {
    errEl.textContent = 'Something went wrong. Please try again.';
  }
}

document.getElementById('loginBtn').addEventListener('click', () => {
  const name = document.getElementById('nameInput').value.trim();
  if (name) login(name);
});
document.getElementById('nameInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const name = document.getElementById('nameInput').value.trim();
    if (name) login(name);
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('chatapp_name');
  location.reload();
});

// ---------- Socket connection ----------
function connectSocket() {
  socket = io();
  socket.on('connect', () => {
    socket.emit('identify', myName);
  });

  socket.on('presence', (onlineList) => {
    onlineSet = new Set(onlineList);
    renderContacts();
    updateChatStatus();
  });

  socket.on('new_message', (msg) => {
    // If this message belongs to the currently open chat, show it
    if (currentChatWith && (msg.from === currentChatWith || msg.to === currentChatWith)) {
      appendMessage(msg);
    }
    loadContacts(); // refresh previews/order
  });

  socket.on('typing', ({ from }) => {
    if (from === currentChatWith) {
      document.getElementById('typingIndicator').textContent = `${currentChatWith} is typing...`;
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        document.getElementById('typingIndicator').textContent = '';
      }, 2000);
    }
  });

  bindCallSocketEvents();
}

// ---------- Contacts ----------
async function loadContacts() {
  const res = await fetch('/api/users');
  const users = (await res.json()).filter(u => u.toLowerCase() !== myName.toLowerCase());
  window._allContacts = users;
  renderContacts();
}

function renderContacts() {
  const listEl = document.getElementById('contactList');
  const users = window._allContacts || [];

  if (!users.length) {
    listEl.innerHTML = '<p style="padding:16px;color:var(--muted);">No contacts yet. Start a new chat above.</p>';
    return;
  }

  listEl.innerHTML = users.map(u => `
    <div class="contact-item ${u === currentChatWith ? 'active' : ''}" data-name="${escapeHtml(u)}">
      <div class="contact-avatar">${initials(u)}</div>
      <div class="contact-info">
        <div class="contact-name">${escapeHtml(u)}</div>
      </div>
      ${onlineSet.has(u) ? '<div class="online-dot" title="Online"></div>' : ''}
    </div>
  `).join('');

  listEl.querySelectorAll('.contact-item').forEach(el => {
    el.addEventListener('click', () => openChat(el.dataset.name));
  });
}

document.getElementById('newChatBtn').addEventListener('click', startNewChat);
document.getElementById('newChatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startNewChat();
});
function startNewChat() {
  const input = document.getElementById('newChatInput');
  const name = input.value.trim();
  if (!name) return;
  if (name.toLowerCase() === myName.toLowerCase()) {
    alert("You can't start a chat with yourself.");
    return;
  }
  input.value = '';
  if (!(window._allContacts || []).includes(name)) {
    window._allContacts = [...(window._allContacts || []), name];
  }
  openChat(name);
}

// ---------- Chat window ----------
async function openChat(name) {
  currentChatWith = name;
  document.getElementById('chatEmpty').style.display = 'none';
  document.getElementById('chatActive').style.display = 'flex';
  document.getElementById('chatWithName').textContent = name;
  document.getElementById('appScreen').classList.add('chat-open');
  renderContacts();
  updateChatStatus();

  const res = await fetch(`/api/messages/${encodeURIComponent(myName)}/${encodeURIComponent(name)}`);
  const messages = await res.json();
  const listEl = document.getElementById('messageList');
  listEl.innerHTML = '';
  messages.forEach(appendMessage);
}

function updateChatStatus() {
  const statusEl = document.getElementById('chatStatus');
  if (!currentChatWith) return;
  statusEl.textContent = onlineSet.has(currentChatWith) ? 'online' : '';
}

function fileIconFor(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(ext)) return '📕';
  if (['doc', 'docx'].includes(ext)) return '📄';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📈';
  if (['zip'].includes(ext)) return '🗜️';
  if (['mp4', 'mov'].includes(ext)) return '🎬';
  return '📎';
}

function appendMessage(msg) {
  const listEl = document.getElementById('messageList');
  const isOut = msg.from === myName;
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isOut ? 'bubble-out' : 'bubble-in'}`;

  let html = '';
  if (msg.attachment) {
    if (msg.attachment.isImage) {
      html += `<img class="msg-image" src="${msg.attachment.url}" alt="photo" onclick="window.open('${msg.attachment.url}','_blank')" />`;
    } else {
      html += `<a class="msg-file" href="${msg.attachment.url}" download="${escapeHtml(msg.attachment.originalName)}">
        <span class="file-icon">${fileIconFor(msg.attachment.originalName)}</span>
        <span class="file-name">${escapeHtml(msg.attachment.originalName)}</span>
      </a>`;
    }
  }
  if (msg.text) html += escapeHtml(msg.text);
  html += `<span class="msg-time">${formatTime(msg.timestamp)}</span>`;

  bubble.innerHTML = html;
  listEl.appendChild(bubble);
  listEl.scrollTop = listEl.scrollHeight;
}

let pendingAttachment = null; // { file, isImage, previewUrl }

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const isImage = file.type.startsWith('image/');
  pendingAttachment = { file, isImage, previewUrl: isImage ? URL.createObjectURL(file) : null };
  renderAttachPreview();
});

function renderAttachPreview() {
  const previewEl = document.getElementById('attachPreview');
  if (!pendingAttachment) {
    previewEl.style.display = 'none';
    previewEl.innerHTML = '';
    return;
  }
  previewEl.style.display = 'flex';
  previewEl.innerHTML = pendingAttachment.isImage
    ? `<img src="${pendingAttachment.previewUrl}" /><span>${escapeHtml(pendingAttachment.file.name)}</span><button type="button" class="remove-attach">Remove</button>`
    : `<span>${fileIconFor(pendingAttachment.file.name)} ${escapeHtml(pendingAttachment.file.name)}</span><button type="button" class="remove-attach">Remove</button>`;
  previewEl.querySelector('.remove-attach').addEventListener('click', () => {
    pendingAttachment = null;
    document.getElementById('fileInput').value = '';
    renderAttachPreview();
  });
}

document.getElementById('messageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!currentChatWith) return;
  if (!text && !pendingAttachment) return;

  let attachment = null;
  if (pendingAttachment) {
    const formData = new FormData();
    formData.append('file', pendingAttachment.file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      attachment = { url: data.url, originalName: data.originalName, isImage: data.isImage, size: data.size };
    } catch (err) {
      alert(err.message);
      return;
    }
  }

  socket.emit('send_message', { from: myName, to: currentChatWith, text, attachment });
  input.value = '';
  pendingAttachment = null;
  document.getElementById('fileInput').value = '';
  renderAttachPreview();
});

document.getElementById('messageInput').addEventListener('input', () => {
  if (currentChatWith) {
    socket.emit('typing', { from: myName, to: currentChatWith });
  }
});

// Back button behavior on mobile: clicking sidebar toggles back to list
// (handled via CSS class chat-open; simple back affordance using header click)
document.addEventListener('click', (e) => {
  if (e.target.id === 'chatWithName') {
    document.getElementById('appScreen').classList.remove('chat-open');
  }
});

// ---------- Voice / Video calling (WebRTC) ----------
// Free public STUN servers help two browsers find each other on most home/normal
// networks. Some restrictive networks (certain corporate WiFi, some mobile carriers)
// may still fail to connect without a paid TURN relay server - see README for details.
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

let peerConnection = null;
let localStream = null;
let callPartner = null;
let currentCallType = null; // 'voice' or 'video'
let isCaller = false;

document.getElementById('voiceCallBtn').addEventListener('click', () => startCall('voice'));
document.getElementById('videoCallBtn').addEventListener('click', () => startCall('video'));

async function startCall(callType) {
  if (!currentChatWith) return;
  if (!onlineSet.has(currentChatWith)) {
    alert(`${currentChatWith} is not online right now.`);
    return;
  }
  callPartner = currentChatWith;
  currentCallType = callType;
  isCaller = true;

  socket.emit('call_user', { from: myName, to: callPartner, callType });
  showActiveCallScreen('Calling...');
}

socket._onIncomingCall = null; // placeholder, real binding below once socket exists

function bindCallSocketEvents() {
  socket.on('incoming_call', ({ from, callType }) => {
    callPartner = from;
    currentCallType = callType;
    isCaller = false;
    document.getElementById('incomingCallAvatar').textContent = initials(from);
    document.getElementById('incomingCallName').textContent = from;
    document.getElementById('incomingCallType').textContent = callType === 'video' ? 'Incoming video call' : 'Incoming voice call';
    document.getElementById('incomingCallScreen').style.display = 'flex';
  });

  socket.on('call_failed', ({ to, reason }) => {
    endCallUI();
    if (reason === 'not_online') alert(`${to} is not online right now.`);
  });

  socket.on('call_accepted', async ({ from }) => {
    document.getElementById('callStatusText').textContent = 'Connecting...';
    await setupPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc_signal', { from: myName, to: callPartner, signal: { type: 'offer', sdp: offer } });
  });

  socket.on('call_rejected', () => {
    alert(`${callPartner} declined the call.`);
    endCallUI();
  });

  socket.on('call_ended', () => {
    endCallUI();
  });

  socket.on('webrtc_signal', async ({ from, signal }) => {
    if (!peerConnection) await setupPeerConnection();

    if (signal.type === 'offer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('webrtc_signal', { from: myName, to: from, signal: { type: 'answer', sdp: answer } });
    } else if (signal.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      document.getElementById('callStatusText').textContent = 'Connected';
    } else if (signal.type === 'ice') {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (e) { /* ignore late candidates */ }
    }
  });
}

async function setupPeerConnection() {
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: currentCallType === 'video'
  });
  document.getElementById('localVideo').srcObject = localStream;
  document.getElementById('localVideo').style.display = currentCallType === 'video' ? 'block' : 'none';
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  const remoteStream = new MediaStream();
  document.getElementById('remoteVideo').srcObject = remoteStream;
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    document.getElementById('callStatusText').textContent = 'Connected';
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc_signal', { from: myName, to: callPartner, signal: { type: 'ice', candidate: event.candidate } });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
      endCallUI();
    }
  };
}

function showActiveCallScreen(statusText) {
  document.getElementById('activeCallScreen').style.display = 'flex';
  document.getElementById('callStatusText').textContent = statusText;
  document.getElementById('localVideo').style.display = currentCallType === 'video' ? 'block' : 'none';
}

document.getElementById('acceptCallBtn').addEventListener('click', async () => {
  document.getElementById('incomingCallScreen').style.display = 'none';
  showActiveCallScreen('Connecting...');
  socket.emit('call_accepted', { from: myName, to: callPartner });
});

document.getElementById('rejectCallBtn').addEventListener('click', () => {
  document.getElementById('incomingCallScreen').style.display = 'none';
  socket.emit('call_rejected', { from: myName, to: callPartner });
  callPartner = null;
});

document.getElementById('hangupBtn').addEventListener('click', () => {
  if (callPartner) socket.emit('call_ended', { from: myName, to: callPartner });
  endCallUI();
});

function endCallUI() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  document.getElementById('remoteVideo').srcObject = null;
  document.getElementById('localVideo').srcObject = null;
  document.getElementById('activeCallScreen').style.display = 'none';
  document.getElementById('incomingCallScreen').style.display = 'none';
  callPartner = null;
  currentCallType = null;
  isCaller = false;
}

// ---------- Init ----------
if (myName) {
  showApp();
}
