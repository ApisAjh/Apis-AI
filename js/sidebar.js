/* =========================================================
   APIS AI — sidebar.js
   New chat, chat history (rename/delete/search), collapse,
   and mobile swipe-to-open drawer.
   ========================================================= */

const ApisSidebar = (() => {
  let searchQuery = '';

  function iconSvg() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
  }

  function render() {
    const user = ApisDB.currentUser();
    if (!user) return;
    const listEl = document.getElementById('chat-history-list');
    if (!listEl) return;

    let chats = ApisDB.getChats(user.email);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      chats = chats.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some(m => (m.text || '').toLowerCase().includes(q))
      );
    }

    if (chats.length === 0) {
      listEl.innerHTML = `<div class="empty-history">${searchQuery ? 'Tidak ada hasil pencarian.' : 'Belum ada percakapan.\nMulai chat baru sekarang.'}</div>`;
      return;
    }

    listEl.innerHTML = chats.map(chat => {
      const lastMsg = chat.messages[chat.messages.length - 1];
      let preview = 'Belum ada pesan';
      if (lastMsg) {
        if (lastMsg.type === 'image') preview = '📷 Gambar';
        else if (lastMsg.type === 'file') preview = `📎 ${lastMsg.fileMeta?.name || 'File'}`;
        else if (lastMsg.type === 'voice') preview = '🎤 Pesan suara';
        else preview = (lastMsg.text || '').replace(/[#*`_>-]/g, '').slice(0, 46);
      }
      const active = chat.id === ApisChat.currentChatId ? 'active' : '';
      return `
        <div class="chat-item ${active}" data-chat-id="${chat.id}">
          <div class="chat-item-icon">${iconSvg()}</div>
          <div class="chat-item-body">
            <div class="chat-item-title">${escapeHtml(chat.title)}</div>
            <div class="chat-item-preview">${escapeHtml(preview)}</div>
          </div>
          <div class="chat-item-date">${formatDateLabel(chat.createdAt)}</div>
          <div class="chat-item-actions">
            <button class="rename-chat-btn" title="Ganti nama" aria-label="Ganti nama chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
            </button>
            <button class="delete-chat-btn danger" title="Hapus" aria-label="Hapus chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.chat-item-actions')) return;
        ApisChat.openChat(item.dataset.chatId);
        closeMobileSidebar();
      });
    });
    listEl.querySelectorAll('.rename-chat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chatId = btn.closest('.chat-item').dataset.chatId;
        startRename(chatId);
      });
    });
    listEl.querySelectorAll('.delete-chat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chatId = btn.closest('.chat-item').dataset.chatId;
        confirmDeleteChat(chatId);
      });
    });
  }

  function startRename(chatId) {
    const user = ApisDB.currentUser();
    const chat = ApisDB.getChats(user.email).find(c => c.id === chatId);
    if (!chat) return;
    const modal = document.getElementById('rename-overlay');
    const input = document.getElementById('rename-input');
    input.value = chat.title;
    modal.dataset.chatId = chatId;
    openOverlay(modal);
    setTimeout(() => { input.focus(); input.select(); }, 250);
  }

  function commitRename() {
    const modal = document.getElementById('rename-overlay');
    const input = document.getElementById('rename-input');
    const chatId = modal.dataset.chatId;
    const newTitle = input.value.trim();
    const user = ApisDB.currentUser();
    if (newTitle) {
      ApisDB.updateChat(user.email, chatId, { title: newTitle });
      render();
      if (ApisChat.currentChatId === chatId) ApisChat.updateHeaderTitle(newTitle);
      showToast('Nama chat diperbarui', 'success');
    }
    closeOverlay(modal);
  }

  function confirmDeleteChat(chatId) {
    const modal = document.getElementById('confirm-overlay');
    modal.dataset.action = 'delete-chat';
    modal.dataset.chatId = chatId;
    document.getElementById('confirm-title').textContent = 'Hapus percakapan ini?';
    document.getElementById('confirm-desc').textContent = 'Semua pesan dalam chat ini akan dihapus permanen dan tidak dapat dikembalikan.';
    openOverlay(modal);
  }

  function newChat() {
    const user = ApisDB.currentUser();
    const chat = ApisDB.createChat(user.email);
    render();
    ApisChat.openChat(chat.id);
    closeMobileSidebar();
  }

  function toggleCollapse() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('apis_sidebar_collapsed', sidebar.classList.contains('collapsed'));
  }

  function openMobileSidebar() {
    document.querySelector('.sidebar').classList.add('mobile-open');
    document.querySelector('.sidebar-backdrop').classList.add('show');
  }
  function closeMobileSidebar() {
    document.querySelector('.sidebar').classList.remove('mobile-open');
    document.querySelector('.sidebar-backdrop').classList.remove('show');
  }
  function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('mobile-open')) closeMobileSidebar();
    else openMobileSidebar();
  }

  function initSwipeGesture() {
    let startX = 0, startY = 0, tracking = false;
    const EDGE = 28; // px from left edge to start opening
    document.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const sidebar = document.querySelector('.sidebar');
      const isOpen = sidebar.classList.contains('mobile-open');
      if (!isOpen && t.clientX > EDGE) return;
      startX = t.clientX; startY = t.clientY; tracking = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > 60) { tracking = false; return; }
      const sidebar = document.querySelector('.sidebar');
      const isOpen = sidebar.classList.contains('mobile-open');
      if (!isOpen && dx > 45) { openMobileSidebar(); tracking = false; }
      if (isOpen && dx < -45) { closeMobileSidebar(); tracking = false; }
    }, { passive: true });

    document.addEventListener('touchend', () => { tracking = false; });
  }

  function initSearch() {
    const input = document.getElementById('sidebar-search-input');
    if (!input) return;
    input.addEventListener('input', () => {
      searchQuery = input.value;
      render();
    });
  }

  function init() {
    const collapsedPref = localStorage.getItem('apis_sidebar_collapsed') === 'true';
    if (collapsedPref && window.innerWidth > 1024) {
      document.querySelector('.sidebar').classList.add('collapsed');
    }
    document.getElementById('new-chat-btn')?.addEventListener('click', newChat);
    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', toggleCollapse);
    document.getElementById('menu-toggle-btn')?.addEventListener('click', toggleMobileSidebar);
    document.querySelector('.sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('rename-confirm-btn')?.addEventListener('click', commitRename);
    document.getElementById('rename-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitRename();
    });
    initSwipeGesture();
    initSearch();
    render();
  }

  return { render, init, newChat, closeMobileSidebar };
})();
