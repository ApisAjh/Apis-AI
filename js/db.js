/* =========================================================
   APIS AI — Data Layer (db.js)
   ---------------------------------------------------------
   Persistence for this demo runs on localStorage so the app
   works fully offline with zero setup. Every read/write goes
   through this module, so swapping localStorage for a real
   backend (Firebase Firestore / Supabase) later only means
   rewriting the functions in this file — nothing else in the
   app needs to change.

   Suggested production schema (Firestore-style):
     users/{uid}                -> profile fields
     users/{uid}/chats/{chatId} -> { title, createdAt, updatedAt }
     users/{uid}/chats/{chatId}/messages/{messageId}
     users/{uid}/settings/app   -> { theme, language }
   ========================================================= */

const ApisDB = (() => {
  const KEYS = {
    users: 'apis_users',
    session: 'apis_session',
    chats: (email) => `apis_chats_${email}`,
    settings: (email) => `apis_settings_${email}`,
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('ApisDB read error', key, e);
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('ApisDB write error', key, e);
      return false;
    }
  }

  // ---------------- Users ----------------
  function getUsers() { return read(KEYS.users, {}); }
  function saveUsers(users) { return write(KEYS.users, users); }

  function createUser({ name, username, email, password }) {
    const users = getUsers();
    if (users[email]) return { ok: false, error: 'Email sudah terdaftar.' };
    const taken = Object.values(users).some(u => u.username.toLowerCase() === username.toLowerCase());
    if (taken) return { ok: false, error: 'Username sudah digunakan.' };
    users[email] = {
      name, username, email, password, // demo only — never store plain passwords in production
      avatar: '',
      joinDate: new Date().toISOString(),
      language: 'id',
    };
    saveUsers(users);
    return { ok: true, user: users[email] };
  }

  function findUser(email) {
    return getUsers()[email] || null;
  }

  function updateUser(email, patch) {
    const users = getUsers();
    if (!users[email]) return null;
    users[email] = { ...users[email], ...patch };
    saveUsers(users);
    return users[email];
  }

  // ---------------- Session ----------------
  // "Ingat saya" dicentang  -> sesi bertahan sampai REMEMBER_MAX_AGE_MS
  //                            (persist lintas restart browser).
  // "Ingat saya" tidak dicentang -> sesi hanya bertahan selama tab/
  //                            browser masih terbuka (ditandai lewat
  //                            sessionStorage, yang otomatis hilang
  //                            saat browser ditutup) DAN tidak lebih
  //                            dari SESSION_MAX_AGE_MS.
  const REMEMBER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari
  const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 jam

  function setSession(email, remember) {
    const payload = { email, ts: Date.now(), remember: Boolean(remember) };
    write(KEYS.session, payload);
    if (!remember) sessionStorage.setItem('apis_session_temp', '1');
    else sessionStorage.removeItem('apis_session_temp');
  }

  /**
   * Returns the raw session payload only if it is still valid:
   * the record exists, has not expired, and (for non-"remember"
   * sessions) the browser/tab hasn't been restarted since login.
   * Invalid/expired sessions are cleared as a side effect so
   * stale data never lingers in storage.
   */
  function getSession() {
    const session = read(KEYS.session, null);
    if (!session) return null;

    // Sessions created before this update have no `remember` field —
    // treat those as remember=true (the previous default behavior)
    // so upgrading the app doesn't silently log everyone out.
    const remember = session.remember !== false;
    const age = Date.now() - (session.ts || 0);
    const maxAge = remember ? REMEMBER_MAX_AGE_MS : SESSION_MAX_AGE_MS;
    const expired = !Number.isFinite(session.ts) || age > maxAge;
    const browserRestarted = !remember && !sessionStorage.getItem('apis_session_temp');

    if (expired || browserRestarted) {
      clearSession();
      return null;
    }
    return session;
  }

  function clearSession() {
    localStorage.removeItem(KEYS.session);
    sessionStorage.removeItem('apis_session_temp');
  }

  /** True only when there is a valid session AND the user it points to still exists. */
  function isSessionValid() {
    const session = getSession();
    return Boolean(session && findUser(session.email));
  }

  function currentUser() {
    const s = getSession();
    if (!s) return null;
    return findUser(s.email);
  }

  // ---------------- Chats ----------------
  function getChats(email) {
    return read(KEYS.chats(email), []);
  }
  function saveChats(email, chats) {
    return write(KEYS.chats(email), chats);
  }
  function createChat(email, title = 'Percakapan Baru') {
    const chats = getChats(email);
    const chat = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title,
      createdAt: new Date().toISOString(),
      messages: [],
    };
    chats.unshift(chat);
    saveChats(email, chats);
    return chat;
  }
  function updateChat(email, chatId, patch) {
    const chats = getChats(email);
    const idx = chats.findIndex(c => c.id === chatId);
    if (idx === -1) return null;
    chats[idx] = { ...chats[idx], ...patch };
    saveChats(email, chats);
    return chats[idx];
  }
  function deleteChat(email, chatId) {
    const chats = getChats(email).filter(c => c.id !== chatId);
    saveChats(email, chats);
  }
  function addMessage(email, chatId, message) {
    const chats = getChats(email);
    const idx = chats.findIndex(c => c.id === chatId);
    if (idx === -1) return null;
    chats[idx].messages.push(message);
    saveChats(email, chats);
    return chats[idx];
  }
  function updateMessage(email, chatId, messageId, patch) {
    const chats = getChats(email);
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return null;
    const m = chat.messages.find(m => m.id === messageId);
    if (!m) return null;
    Object.assign(m, patch);
    saveChats(email, chats);
    return m;
  }
  function deleteMessage(email, chatId, messageId) {
    const chats = getChats(email);
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return null;
    chat.messages = chat.messages.filter(m => m.id !== messageId);
    saveChats(email, chats);
    return chat;
  }
  function deleteAllChats(email) {
    saveChats(email, []);
  }

  // ---------------- Settings ----------------
  function getSettings(email) {
    return read(KEYS.settings(email), { theme: 'light', language: 'id' });
  }
  function saveSettings(email, patch) {
    const s = { ...getSettings(email), ...patch };
    write(KEYS.settings(email), s);
    return s;
  }

  return {
    createUser, findUser, updateUser,
    setSession, getSession, clearSession, currentUser, isSessionValid,
    getChats, saveChats, createChat, updateChat, deleteChat,
    addMessage, updateMessage, deleteMessage, deleteAllChats,
    getSettings, saveSettings,
  };
})();
