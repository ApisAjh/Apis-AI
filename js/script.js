/* =========================================================
   APIS AI — script.js
   Dashboard bootstrap: header, profile dropdown, settings,
   profile modal, export/delete data, wiring all modules.
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  guardDashboard();
  const user = ApisDB.currentUser();
  if (!user) return;

  populateHeaderUser(user);
  initProfileDropdown();
  initSettingsModal(user);
  initGenericModals();

  ApisSidebar.init();
  ApisChat.init();
  ApisUpload.init();
  ApisVoice.init();
});

function populateHeaderUser(user) {
  document.querySelectorAll('.user-avatar-slot').forEach(el => {
    el.innerHTML = user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : initials(user.name);
  });
  const nameEl = document.getElementById('dropdown-user-name');
  const emailEl = document.getElementById('dropdown-user-email');
  if (nameEl) nameEl.textContent = user.name;
  if (emailEl) emailEl.textContent = user.email;
}

function initProfileDropdown() {
  const trigger = document.getElementById('profile-trigger');
  const dropdown = document.getElementById('profile-dropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== trigger) dropdown.classList.remove('open');
  });

  document.getElementById('open-settings-btn')?.addEventListener('click', () => {
    dropdown.classList.remove('open');
    openOverlay(document.getElementById('settings-overlay'));
  });
  document.getElementById('open-profile-btn')?.addEventListener('click', () => {
    dropdown.classList.remove('open');
    openOverlay(document.getElementById('settings-overlay'));
    switchSettingsTab('profile');
  });
  document.getElementById('dropdown-logout-btn')?.addEventListener('click', logout);
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
}

function initSettingsModal(user) {
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => switchSettingsTab(tab.dataset.tab));
  });

  // Profile panel
  const nameInput = document.getElementById('settings-name');
  const usernameDisplay = document.getElementById('settings-username-display');
  const emailDisplay = document.getElementById('settings-email-display');
  const joinDisplay = document.getElementById('settings-join-display');
  const avatarSlot = document.getElementById('settings-avatar-slot');
  const avatarInput = document.getElementById('avatar-upload-input');

  function refreshProfilePanel() {
    const u = ApisDB.currentUser();
    if (nameInput) nameInput.value = u.name;
    if (usernameDisplay) usernameDisplay.textContent = '@' + u.username;
    if (emailDisplay) emailDisplay.textContent = u.email;
    if (joinDisplay) joinDisplay.textContent = new Date(u.joinDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    if (avatarSlot) avatarSlot.innerHTML = u.avatar ? `<img src="${u.avatar}" alt="${u.name}">` : initials(u.name);
  }
  refreshProfilePanel();

  document.getElementById('change-avatar-btn')?.addEventListener('click', () => avatarInput.click());
  avatarInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const u = ApisDB.currentUser();
      ApisDB.updateUser(u.email, { avatar: reader.result });
      refreshProfilePanel();
      populateHeaderUser(ApisDB.currentUser());
      showToast('Foto profil diperbarui', 'success');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('save-profile-btn')?.addEventListener('click', () => {
    const u = ApisDB.currentUser();
    const newName = nameInput.value.trim();
    if (newName.length < 2) { showToast('Nama minimal 2 karakter', 'error'); return; }
    ApisDB.updateUser(u.email, { name: newName });
    refreshProfilePanel();
    populateHeaderUser(ApisDB.currentUser());
    ApisChat.renderEmptyState && document.querySelector('.empty-state') && ApisChat.renderEmptyState();
    showToast('Profil disimpan', 'success');
  });

  // General panel: theme + language
  const langSelect = document.getElementById('settings-language');
  if (langSelect) {
    langSelect.value = ApisDB.getSettings(user.email).language || 'id';
    langSelect.addEventListener('change', () => {
      ApisDB.saveSettings(user.email, { language: langSelect.value });
      showToast('Preferensi bahasa disimpan', 'success', 1800);
    });
  }

  // Data panel: export & delete
  document.getElementById('export-chat-btn')?.addEventListener('click', () => {
    const u = ApisDB.currentUser();
    const chats = ApisDB.getChats(u.email);
    if (chats.length === 0) { showToast('Belum ada percakapan untuk diekspor', 'info'); return; }
    const blob = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `apis-ai-chats-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('Riwayat chat berhasil diekspor', 'success');
  });

  document.getElementById('delete-all-chats-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('confirm-overlay');
    modal.dataset.action = 'delete-all-chats';
    document.getElementById('confirm-title').textContent = 'Hapus semua percakapan?';
    document.getElementById('confirm-desc').textContent = 'Tindakan ini akan menghapus seluruh riwayat chat kamu secara permanen dan tidak dapat dibatalkan.';
    openOverlay(modal);
  });
}

function initGenericModals() {
  // Close buttons for any overlay
  document.querySelectorAll('[data-close-overlay]').forEach(btn => {
    btn.addEventListener('click', () => closeOverlay(btn.closest('.overlay')));
  });
  // Esc closes topmost open overlay
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.overlay.open').forEach(o => closeOverlay(o));
      document.getElementById('lightbox')?.classList.remove('open');
    }
  });
}
