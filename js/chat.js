/* =========================================================
   APIS AI — chat.js
   Message rendering, sending, mock AI reply engine, markdown.
   ---------------------------------------------------------
   To connect a real model: replace `generateAIReply()` with a
   fetch() call to your inference endpoint (Google Gemini,
   OpenAI, self-hosted, etc.) and stream the tokens into the
   same `renderMessage()` pipeline used here.
   ========================================================= */

const ApisChat = (() => {
  let currentChatId = null;
  let pendingAttachments = []; // {type:'image'|'file', data, name, size, mime}

  const EXAMPLE_PROMPTS = [
    { icon: 'brain', text: 'Jelaskan Artificial Intelligence' },
    { icon: 'code', text: 'Buat Website Portfolio' },
    { icon: 'doc', text: 'Ringkas Dokumen' },
    { icon: 'globe', text: 'Terjemahkan Bahasa Inggris' },
    { icon: 'html', text: 'Buat Kode HTML' },
  ];

  /* ---------- Minimal markdown renderer ---------- */
  function renderMarkdown(src) {
    if (!src) return '';
    let text = escapeHtml(src);

    // code blocks ```
    const codeBlocks = [];
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => {
      codeBlocks.push({ lang, code });
      return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
    });

    // tables (simple GFM)
    text = text.replace(/((?:^\|.*\|\n?)+)/gm, (block) => {
      const lines = block.trim().split('\n');
      if (lines.length < 2 || !/^\|?\s*-{2,}/.test(lines[1].replace(/\|/g, ' '))) return block;
      const headCells = lines[0].split('|').map(s => s.trim()).filter(Boolean);
      const bodyRows = lines.slice(2).map(l => l.split('|').map(s => s.trim()).filter(Boolean));
      let html = '<table><thead><tr>' + headCells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      bodyRows.forEach(row => { html += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>'; });
      html += '</tbody></table>';
      return html;
    });

    // blockquote
    text = text.replace(/^&gt; ?(.*)$/gm, '<blockquote>$1</blockquote>');
    // headers
    text = text.replace(/^### (.*)$/gm, '<strong style="font-size:1.05em">$1</strong>');
    text = text.replace(/^## (.*)$/gm, '<strong style="font-size:1.1em">$1</strong>');
    // bold / italic
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>');
    // inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // images ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\((https?:[^\s)]+)\)/g, '<img class="msg-image" src="$2" alt="$1" loading="lazy">');
    // links [text](url)
    text = text.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // unordered list
    text = text.replace(/(^|\n)((?:[-*] .*(?:\n|$))+)/g, (m, pre, block) => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
      return `${pre}<ul>${items}</ul>`;
    });
    // ordered list
    text = text.replace(/(^|\n)((?:\d+\. .*(?:\n|$))+)/g, (m, pre, block) => {
      const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `${pre}<ol>${items}</ol>`;
    });
    // paragraphs
    text = text.split(/\n{2,}/).map(chunk => {
      if (/^<(ul|ol|table|blockquote|strong)/.test(chunk.trim())) return chunk;
      return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    // restore code blocks
    text = text.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (m, i) => {
      const { lang, code } = codeBlocks[i];
      return `<pre><button class="code-copy-btn" data-code="${encodeURIComponent(code.trim())}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Salin</button><code>${escapeHtml(code.trim())}</code></pre>`;
    });

    return text;
  }

  /* ---------- Mock AI response engine ---------- */
  function generateAIReply(userText, attachments) {
    const t = (userText || '').toLowerCase();

    if (attachments && attachments.some(a => a.type === 'image')) {
      return `Saya menerima gambar yang kamu kirim. Untuk saat ini, analisis gambar mendalam memerlukan koneksi ke model vision melalui backend AI sungguhan. Ceritakan konteks gambarnya, dan saya bantu jelaskan atau proses lebih lanjut.`;
    }
    if (attachments && attachments.some(a => a.type === 'file')) {
      const f = attachments.find(a => a.type === 'file');
      return `File **${f.name}** (${formatBytes(f.size)}) berhasil diterima. Hubungkan backend pemroses dokumen untuk mengekstrak dan meringkas isinya secara otomatis — untuk demo ini saya hanya mencatat lampirannya.`;
    }
    if (attachments && attachments.some(a => a.type === 'voice')) {
      return `Pesan suara kamu sudah diterima 🎤. Integrasikan speech-to-text (mis. Whisper API) di \`voice.js\` agar saya bisa memahami dan membalas isi rekaman secara otomatis.`;
    }

    if (/artificial intelligence|kecerdasan buatan/.test(t)) {
      return `**Artificial Intelligence (AI)** adalah cabang ilmu komputer yang membangun sistem mampu meniru kemampuan berpikir manusia, seperti belajar, bernalar, dan mengambil keputusan.\n\nBeberapa cabang utamanya:\n- **Machine Learning** — sistem belajar dari data\n- **Natural Language Processing** — memahami bahasa manusia\n- **Computer Vision** — memahami gambar & video\n- **Robotics** — AI yang berinteraksi dengan dunia fisik\n\n> AI modern seperti Apis AI menggunakan model bahasa besar (LLM) yang dilatih pada miliaran teks untuk memahami konteks dan menghasilkan jawaban yang relevan.\n\nMau saya perdalam salah satu topik di atas?`;
    }
    if (/portfolio|portofolio/.test(t)) {
      return `Berikut kerangka dasar **Website Portfolio** yang bisa kamu kembangkan:\n\n\`\`\`html\n<!DOCTYPE html>\n<html lang="id">\n<head>\n  <meta charset="UTF-8">\n  <title>Portofolio Saya</title>\n</head>\n<body>\n  <header>\n    <h1>Nama Kamu</h1>\n    <p>Frontend Developer</p>\n  </header>\n  <section id="projects">\n    <h2>Proyek</h2>\n  </section>\n</body>\n</html>\n\`\`\`\n\nStruktur halaman yang direkomendasikan:\n1. Hero section — perkenalan singkat\n2. About — latar belakang & skill\n3. Projects — showcase karya\n4. Contact — cara menghubungi\n\nIngin saya kembangkan salah satu bagian secara lebih detail?`;
    }
    if (/ringkas|dokumen|summary/.test(t)) {
      return `Untuk meringkas dokumen, unggah file lewat tombol 📎 pada kolom chat. Setelah backend pemroses dokumen terhubung, saya akan:\n\n- Mengekstrak isi dokumen\n- Mengidentifikasi poin-poin utama\n- Menyusun ringkasan singkat dan padat\n\nSaat ini saya bisa membantu meringkas jika kamu **tempel langsung teksnya** di sini.`;
    }
    if (/terjemah|translate|bahasa inggris/.test(t)) {
      return `Tentu, tempelkan teks yang ingin diterjemahkan ke Bahasa Inggris, contohnya:\n\n> "Selamat pagi, semoga harimu menyenangkan."\n\nHasil: *"Good morning, I hope you have a wonderful day."*\n\nKirim teks lengkapmu dan saya bantu terjemahkan sekarang.`;
    }
    if (/html|kode/.test(t)) {
      return `Berikut contoh kode HTML sederhana untuk halaman landing:\n\n\`\`\`html\n<section class="hero">\n  <h1>Selamat Datang</h1>\n  <p>Solusi digital untuk bisnismu.</p>\n  <button>Mulai Sekarang</button>\n</section>\n\`\`\`\n\nBerikut tabel elemen HTML yang sering dipakai:\n\n| Tag | Fungsi |\n| --- | --- |\n| \`<section>\` | Membagi konten menjadi blok |\n| \`<button>\` | Elemen interaktif |\n| \`<img>\` | Menampilkan gambar |\n\nMau saya lanjutkan dengan styling CSS-nya juga?`;
    }
    if (/^(hai|halo|hi|hello|hey)\b/.test(t)) {
      return `Halo! 👋 Senang bisa membantu. Apa yang ingin kamu kerjakan hari ini?`;
    }
    if (/terima kasih|makasih|thanks/.test(t)) {
      return `Sama-sama! Kalau ada yang lain yang bisa saya bantu, tinggal ketik saja ya 😊`;
    }

    const fallbacks = [
      `Menarik! Bisa kamu ceritakan lebih detail soal "${escapeHtml(userText.slice(0, 60))}" supaya saya bisa bantu dengan lebih tepat?`,
      `Saya mencatat pertanyaanmu. Ini adalah respons demo dari Apis AI — hubungkan endpoint model bahasa asli (mis. Google Gemini) di fungsi \`generateAIReply()\` pada \`chat.js\` agar jawabannya benar-benar cerdas dan kontekstual.`,
      `Baik, saya pahami maksudmu. Untuk memberi jawaban paling akurat, jelaskan sedikit konteks tambahan ya.`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /* ---------- Icons for empty-state prompt cards ---------- */
  function promptIcon(name) {
    const icons = {
      brain: '<path d="M9.5 2a3.5 3.5 0 00-3.5 3.5v.55A3.5 3.5 0 004 9.3v1.4A3.5 3.5 0 006 14v1a3.5 3.5 0 003.5 3.5M9.5 2A3.5 3.5 0 0113 5.5v13A3.5 3.5 0 019.5 22M14.5 2a3.5 3.5 0 013.5 3.5v.55A3.5 3.5 0 0120 9.3v1.4a3.5 3.5 0 01-2 3.3v1a3.5 3.5 0 01-3.5 3.5M14.5 2A3.5 3.5 0 0011 5.5v13a3.5 3.5 0 003.5 3.5"/>',
      code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
      doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
      globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',
      html: '<path d="M4 3l1.5 17L12 22l6.5-2L20 3H4z"/><path d="M8 8h8l-.5 5H9l.2 2 2.8.8 2.8-.8.2-2"/>',
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.brain}</svg>`;
  }

  function renderEmptyState() {
    const area = document.getElementById('chat-area');
    const user = ApisDB.currentUser();
    area.innerHTML = `
      <div class="empty-state fade-in">
        <div class="empty-illustration">
          ${emptyIllustrationSvg()}
        </div>
        <h2>Halo${user ? ', ' + user.name.split(' ')[0] : ''}, Ada yang bisa saya bantu?</h2>
        <p class="dev-by">Development by Apis</p>
        <div class="prompt-grid">
          ${EXAMPLE_PROMPTS.map(p => `
            <div class="prompt-card" data-prompt="${escapeHtml(p.text)}">
              <div class="pc-icon">${promptIcon(p.icon)}</div>
              <div class="pc-text">${p.text}</div>
            </div>`).join('')}
        </div>
      </div>`;
    area.querySelectorAll('.prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        if (!currentChatId) startChatFromScratch();
        sendMessage(card.dataset.prompt);
      });
    });
  }

  function emptyIllustrationSvg() {
    return `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="illuGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#4C6FFF"/><stop offset="1" stop-color="#8B5CF6"/>
        </linearGradient>
      </defs>
      <polygon points="60,6 108,33 108,87 60,114 12,87 12,33" fill="url(#illuGrad)" opacity="0.12"/>
      <polygon points="60,20 96,40 96,80 60,100 24,80 24,40" fill="none" stroke="url(#illuGrad)" stroke-width="2.5"/>
      <circle cx="60" cy="60" r="16" fill="url(#illuGrad)"/>
      <circle cx="48" cy="53" r="3.2" fill="#fff"/>
      <circle cx="72" cy="53" r="3.2" fill="#fff"/>
      <path d="M50 68q10 8 20 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  function startChatFromScratch() {
    const user = ApisDB.currentUser();
    const chat = ApisDB.createChat(user.email);
    currentChatId = chat.id;
    ApisSidebar.render();
  }

  function updateHeaderTitle(title) {
    const el = document.getElementById('current-chat-title');
    if (el) el.textContent = title || 'Apis AI';
  }

  function openChat(chatId) {
    currentChatId = chatId;
    const user = ApisDB.currentUser();
    const chat = ApisDB.getChats(user.email).find(c => c.id === chatId);
    if (!chat) return;
    updateHeaderTitle(chat.title);
    ApisSidebar.render();
    renderMessages(chat);
  }

  function renderMessages(chat) {
    const area = document.getElementById('chat-area');
    if (!chat.messages.length) {
      renderEmptyState();
      updateHeaderTitle('Percakapan Baru');
      return;
    }
    area.innerHTML = `<div class="chat-inner" id="messages-list"></div>`;
    const list = document.getElementById('messages-list');
    chat.messages.forEach(m => list.appendChild(buildMessageNode(m)));
    scrollToBottom();
  }

  function buildMessageNode(m) {
    const row = document.createElement('div');
    row.className = `msg-row ${m.role}`;
    row.dataset.msgId = m.id;

    const avatar = m.role === 'ai'
      ? `<div class="msg-avatar ai">${logoMiniSvg()}</div>`
      : `<div class="msg-avatar user">${userIconSvg()}</div>`;

    let bodyHtml = '';
    if (m.type === 'image') {
      bodyHtml = `<div class="bubble"><img class="msg-image" src="${m.imageData}" alt="Gambar terkirim">${m.text ? `<p style="margin-top:8px">${renderMarkdown(m.text)}</p>` : ''}</div>`;
    } else if (m.type === 'file') {
      bodyHtml = `<div class="bubble"><div class="file-chip">
        <div class="file-chip-icon">${fileIconSvg(m.fileMeta.ext)}</div>
        <div class="file-chip-info"><div class="fname">${escapeHtml(m.fileMeta.name)}</div><div class="fsize">${formatBytes(m.fileMeta.size)}</div></div>
      </div></div>`;
    } else if (m.type === 'voice') {
      bodyHtml = `<div class="bubble">${buildVoiceBubbleHtml(m)}</div>`;
    } else {
      bodyHtml = `<div class="bubble">${m.editing ? '' : renderMarkdown(m.text)}</div>`;
    }

    const canEdit = m.role === 'user' && m.type === 'text';
    row.innerHTML = `
      ${avatar}
      <div class="msg-col">
        ${bodyHtml}
        <div class="msg-meta">
          <span>${formatTime(m.timestamp)}</span>
          <div class="msg-actions">
            <button class="copy-msg-btn" title="Salin" aria-label="Salin pesan">${copyIconSvg()}</button>
            ${canEdit ? `<button class="edit-msg-btn" title="Edit" aria-label="Edit pesan">${editIconSvg()}</button>` : ''}
            <button class="delete-msg-btn" title="Hapus" aria-label="Hapus pesan">${trashIconSvg()}</button>
          </div>
        </div>
      </div>`;

    row.querySelector('.copy-msg-btn').addEventListener('click', () => copyMessage(m));
    row.querySelector('.delete-msg-btn').addEventListener('click', () => deleteMessageConfirm(m.id));
    const editBtn = row.querySelector('.edit-msg-btn');
    if (editBtn) editBtn.addEventListener('click', () => startEditMessage(m.id));

    row.querySelectorAll('.code-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(decodeURIComponent(btn.dataset.code));
        btn.innerHTML = '✓ Disalin';
        setTimeout(() => { btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Salin`; }, 1500);
      });
    });

    const img = row.querySelector('img.msg-image');
    if (img) img.addEventListener('click', () => openLightbox(img.src));

    const voicePlay = row.querySelector('.voice-play-btn');
    if (voicePlay) ApisVoice.wirePlayback(row, m);

    return row;
  }

  function buildVoiceBubbleHtml(m) {
    const bars = Array.from({ length: 28 }, () => 6 + Math.round(Math.random() * 18));
    return `<div class="voice-bubble" data-audio="${m.audioData}">
      <button class="voice-play-btn">${playIconSvg()}</button>
      <div class="voice-wave">${bars.map(h => `<span style="height:${h}px"></span>`).join('')}</div>
      <span class="voice-duration">${m.duration || '0:00'}</span>
    </div>`;
  }

  /* ---------- Sending ---------- */
  function sendMessage(text) {
    const user = ApisDB.currentUser();
    if (!currentChatId) startChatFromScratch();

    text = (text ?? document.getElementById('composer-textarea').value).trim();
    if (!text && pendingAttachments.length === 0) return;

    const chatBefore = ApisDB.getChats(user.email).find(c => c.id === currentChatId);
    const isFirstMessage = chatBefore.messages.length === 0;

    // flush attachments as separate messages (image/file), then text if any
    const attachmentsSnapshot = [...pendingAttachments];
    pendingAttachments = [];
    clearComposerAttachmentsUI();

    attachmentsSnapshot.forEach(att => {
      const msg = {
        id: 'm_' + Date.now() + Math.random().toString(36).slice(2, 6),
        role: 'user',
        type: att.type,
        text: '',
        timestamp: new Date().toISOString(),
      };
      if (att.type === 'image') msg.imageData = att.data;
      if (att.type === 'file') msg.fileMeta = { name: att.name, size: att.size, ext: att.ext };
      ApisDB.addMessage(user.email, currentChatId, msg);
    });

    if (text) {
      const msg = { id: 'm_' + Date.now() + Math.random().toString(36).slice(2, 6), role: 'user', type: 'text', text, timestamp: new Date().toISOString() };
      ApisDB.addMessage(user.email, currentChatId, msg);
    }

    if (isFirstMessage) {
      const title = (text || attachmentsSnapshot[0]?.name || 'Percakapan Baru').slice(0, 40);
      ApisDB.updateChat(user.email, currentChatId, { title });
      updateHeaderTitle(title);
    }

    const chat = ApisDB.getChats(user.email).find(c => c.id === currentChatId);
    renderMessages(chat);
    document.getElementById('composer-textarea').value = '';
    autoResizeTextarea();
    ApisSidebar.render();

    showTyping();
    deliverAIReply(user.email, currentChatId, text, attachmentsSnapshot);
  }

  let backendWarningShown = false;

  /**
   * Tries the real backend (server/server.js -> Google Gemini API) first.
   * If it's not running, not configured, or errors out for any reason,
   * silently falls back to the built-in demo reply engine so the app
   * keeps working either way. Shows a one-time toast the first time it
   * falls back, so it's clear which mode is active.
   */
  async function deliverAIReply(email, chatId, fallbackSourceText, attachmentsSnapshot) {
    const chatForHistory = ApisDB.getChats(email).find(c => c.id === chatId);
    let replyText;
    let usedBackend = true;

    try {
      replyText = await ApisAPI.sendChat(chatForHistory.messages);
      if (!replyText || !replyText.trim()) throw new Error('Balasan kosong dari backend.');
    } catch (err) {
      usedBackend = false;
      replyText = generateAIReply(fallbackSourceText, attachmentsSnapshot);
      if (!backendWarningShown) {
        backendWarningShown = true;
        showToast('Backend AI belum aktif, memakai balasan demo. Jalankan server/server.js untuk balasan asli.', 'info', 4500);
      }
    }

    // Keep the typing indicator visible a bit longer for the demo engine so it
    // doesn't feel instant/robotic; real backend replies show as soon as they arrive.
    const extraDelay = usedBackend ? 0 : 500 + Math.min(1200, replyText.length * 6);
    setTimeout(() => {
      hideTyping();
      const aiMsg = { id: 'm_' + Date.now() + Math.random().toString(36).slice(2, 6), role: 'ai', type: 'text', text: replyText, timestamp: new Date().toISOString() };
      ApisDB.addMessage(email, chatId, aiMsg);
      if (chatId === currentChatId) {
        const list = document.getElementById('messages-list');
        if (list) { list.appendChild(buildMessageNode(aiMsg)); scrollToBottom(); }
      }
      ApisSidebar.render();
    }, extraDelay);
  }

  function showTyping() {
    const list = document.getElementById('messages-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    row.id = 'typing-row';
    row.innerHTML = `<div class="msg-avatar ai">${logoMiniSvg()}</div>
      <div class="msg-col"><div class="bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`;
    list.appendChild(row);
    scrollToBottom();
  }
  function hideTyping() {
    document.getElementById('typing-row')?.remove();
  }

  function scrollToBottom() {
    const area = document.getElementById('chat-area');
    requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
  }

  /* ---------- Message actions ---------- */
  function copyMessage(m) {
    navigator.clipboard.writeText(m.text || '');
    showToast('Pesan disalin', 'success', 1800);
  }

  function deleteMessageConfirm(msgId) {
    const modal = document.getElementById('confirm-overlay');
    modal.dataset.action = 'delete-message';
    modal.dataset.msgId = msgId;
    document.getElementById('confirm-title').textContent = 'Hapus pesan ini?';
    document.getElementById('confirm-desc').textContent = 'Pesan yang dihapus tidak dapat dikembalikan.';
    openOverlay(modal);
  }

  function startEditMessage(msgId) {
    const row = document.querySelector(`.msg-row[data-msg-id="${msgId}"]`);
    if (!row) return;
    const user = ApisDB.currentUser();
    const chat = ApisDB.getChats(user.email).find(c => c.id === currentChatId);
    const m = chat.messages.find(x => x.id === msgId);
    const bubble = row.querySelector('.bubble');
    const original = m.text;
    bubble.innerHTML = `<textarea class="edit-textarea" style="width:100%;min-width:220px;background:transparent;border:none;outline:none;color:inherit;font:inherit;resize:vertical;min-height:60px;">${escapeHtml(original)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
        <button class="btn btn-ghost btn-sm cancel-edit" style="padding:6px 12px;font-size:12.5px;">Batal</button>
        <button class="btn btn-primary btn-sm save-edit" style="padding:6px 14px;font-size:12.5px;">Simpan</button>
      </div>`;
    const ta = bubble.querySelector('.edit-textarea');
    ta.focus();
    bubble.querySelector('.cancel-edit').addEventListener('click', () => {
      const chat2 = ApisDB.getChats(user.email).find(c => c.id === currentChatId);
      renderMessages(chat2);
    });
    bubble.querySelector('.save-edit').addEventListener('click', () => {
      const newText = ta.value.trim();
      if (!newText) return;
      ApisDB.updateMessage(user.email, currentChatId, msgId, { text: newText, edited: true });
      const chat2 = ApisDB.getChats(user.email).find(c => c.id === currentChatId);
      renderMessages(chat2);
      ApisSidebar.render();
      showToast('Pesan diperbarui', 'success', 1800);
    });
  }

  function handleConfirmedDelete() {
    const modal = document.getElementById('confirm-overlay');
    const action = modal.dataset.action;
    const user = ApisDB.currentUser();
    if (action === 'delete-chat') {
      const chatId = modal.dataset.chatId;
      ApisDB.deleteChat(user.email, chatId);
      ApisSidebar.render();
      if (currentChatId === chatId) {
        currentChatId = null;
        renderEmptyState();
        updateHeaderTitle('Apis AI');
      }
      showToast('Percakapan dihapus', 'success');
    } else if (action === 'delete-message') {
      const msgId = modal.dataset.msgId;
      ApisDB.deleteMessage(user.email, currentChatId, msgId);
      const chat = ApisDB.getChats(user.email).find(c => c.id === currentChatId);
      renderMessages(chat);
      ApisSidebar.render();
      showToast('Pesan dihapus', 'success');
    } else if (action === 'delete-all-chats') {
      ApisDB.deleteAllChats(user.email);
      currentChatId = null;
      ApisSidebar.render();
      renderEmptyState();
      updateHeaderTitle('Apis AI');
      showToast('Semua percakapan dihapus', 'success');
    }
    closeOverlay(modal);
  }

  /* ---------- Attachments (called from upload.js / voice.js) ---------- */
  function updateSendButtonState() {
    const textarea = document.getElementById('composer-textarea');
    const sendBtn = document.getElementById('send-btn');
    if (!textarea || !sendBtn) return;
    sendBtn.disabled = !textarea.value.trim() && pendingAttachments.length === 0;
  }

  function addPendingAttachment(att) {
    pendingAttachments.push(att);
    renderComposerAttachmentsUI();
    updateSendButtonState();
  }
  function removePendingAttachment(idx) {
    pendingAttachments.splice(idx, 1);
    renderComposerAttachmentsUI();
    updateSendButtonState();
  }
  function renderComposerAttachmentsUI() {
    const wrap = document.getElementById('composer-attachments');
    if (!wrap) return;
    if (pendingAttachments.length === 0) { wrap.innerHTML = ''; wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    wrap.innerHTML = pendingAttachments.map((att, i) => {
      if (att.type === 'image') {
        return `<div class="attach-thumb"><img src="${att.data}"><button class="rm" data-idx="${i}">${closeIconSvg()}</button></div>`;
      }
      return `<div class="attach-file-chip">${fileIconSvg(att.ext, 14)}<span>${escapeHtml(att.name)}</span><button class="rm" data-idx="${i}">${closeIconSvg()}</button></div>`;
    }).join('');
    wrap.querySelectorAll('.rm').forEach(btn => btn.addEventListener('click', () => removePendingAttachment(+btn.dataset.idx)));
  }
  function clearComposerAttachmentsUI() {
    renderComposerAttachmentsUI();
    updateSendButtonState();
  }

  /* ---------- Lightbox ---------- */
  function openLightbox(src) {
    const lb = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = src;
    lb.classList.add('open');
    document.getElementById('lightbox-download').onclick = () => {
      const a = document.createElement('a');
      a.href = src; a.download = 'apis-ai-image.png'; a.click();
    };
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
  }

  /* ---------- Icons ---------- */
  function logoMiniSvg() {
    return `<svg viewBox="0 0 24 24" fill="none"><polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="white" opacity="0.9"/></svg>`;
  }
  function userIconSvg() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`; }
  function copyIconSvg() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`; }
  function editIconSvg() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>`; }
  function trashIconSvg() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>`; }
  function closeIconSvg() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`; }
  function playIconSvg() { return `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`; }
  function pauseIconSvg() { return `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; }
  function fileIconSvg(ext, size = 17) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="${size}" height="${size}"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }

  function autoResizeTextarea() {
    const ta = document.getElementById('composer-textarea');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(180, ta.scrollHeight) + 'px';
  }

  function init() {
    const user = ApisDB.currentUser();
    if (!user) return;
    const chats = ApisDB.getChats(user.email);
    if (chats.length > 0) {
      openChat(chats[0].id);
    } else {
      renderEmptyState();
    }

    const textarea = document.getElementById('composer-textarea');
    const sendBtn = document.getElementById('send-btn');
    const composer = document.querySelector('.composer');

    textarea.addEventListener('input', () => {
      autoResizeTextarea();
      updateSendButtonState();
    });
    textarea.addEventListener('focus', () => composer.classList.add('focused'));
    textarea.addEventListener('blur', () => composer.classList.remove('focused'));
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (textarea.value.trim() || pendingAttachments.length) sendMessage();
      }
    });
    sendBtn.addEventListener('click', () => {
      if (textarea.value.trim() || pendingAttachments.length) sendMessage();
    });

    document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
    document.getElementById('lightbox')?.addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') closeLightbox();
    });

    document.getElementById('confirm-ok-btn')?.addEventListener('click', handleConfirmedDelete);
  }

  function sendVoiceMessage(audioData, duration) {
    const user = ApisDB.currentUser();
    if (!currentChatId) startChatFromScratch();
    const isFirstMessage = ApisDB.getChats(user.email).find(c => c.id === currentChatId).messages.length === 0;

    const msg = { id: 'm_' + Date.now() + Math.random().toString(36).slice(2, 6), role: 'user', type: 'voice', text: '', audioData, duration, timestamp: new Date().toISOString() };
    ApisDB.addMessage(user.email, currentChatId, msg);

    if (isFirstMessage) {
      ApisDB.updateChat(user.email, currentChatId, { title: 'Pesan Suara' });
      updateHeaderTitle('Pesan Suara');
    }

    const chat = ApisDB.getChats(user.email).find(c => c.id === currentChatId);
    renderMessages(chat);
    ApisSidebar.render();

    showTyping();
    deliverAIReply(user.email, currentChatId, '', [{ type: 'voice' }]);
  }

  return {
    init, sendMessage, openChat, get currentChatId() { return currentChatId; },
    updateHeaderTitle, addPendingAttachment, autoResizeTextarea, renderEmptyState, sendVoiceMessage,
  };
})();
