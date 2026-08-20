/* =========================================================
   APIS AI — auth.js
   Handles login & register forms.
   NOTE: This demo authenticates against localStorage so the
   whole app runs without a server. Swap `ApisDB` functions
   for real calls to Firebase Auth / your JWT backend when
   you connect a real database — the form logic below stays
   the same.
   ========================================================= */

/**
 * Guards the main app page. The real check already ran inline in
 * <head> (see the session-guard script in index.html) before any
 * app content painted; this call is the same check run again after
 * scripts load, in case the session expired/logged out in another
 * tab between that early check and now.
 */
function guardDashboard() {
  if (!ApisDB.isSessionValid()) {
    window.location.href = 'login.html';
  }
}

function redirectIfLoggedIn() {
  if (ApisDB.isSessionValid()) {
    window.location.href = 'index.html';
  }
}

function setFieldError(fieldEl, message) {
  fieldEl.classList.add('has-error');
  const err = fieldEl.querySelector('.field-error');
  if (err) err.textContent = message;
}
function clearFieldError(fieldEl) {
  fieldEl.classList.remove('has-error');
}

function togglePasswordVisibility(btn) {
  const wrap = btn.closest('.input-wrap');
  const input = wrap.querySelector('input');
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  btn.innerHTML = isPass ? eyeOffSvg() : eyeSvg();
}
function eyeSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
}
function eyeOffSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a21.6 21.6 0 015.06-6.06M9.9 4.24A10.4 10.4 0 0112 4c7 0 11 7 11 7a21.7 21.7 0 01-3.22 4.36M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

/* ---------------- LOGIN ---------------- */
function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;
  redirectIfLoggedIn();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailField = document.getElementById('field-email');
    const passField = document.getElementById('field-password');
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me').checked;

    clearFieldError(emailField);
    clearFieldError(passField);

    if (!email) { setFieldError(emailField, 'Email wajib diisi.'); return; }
    if (!password) { setFieldError(passField, 'Password wajib diisi.'); return; }

    const user = ApisDB.findUser(email);
    if (!user || user.password !== password) {
      setFieldError(passField, 'Email atau password salah.');
      showToast('Email atau password salah', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = 'Masuk...';
    setTimeout(() => {
      ApisDB.setSession(email, remember);
      showToast(`Selamat datang kembali, ${user.name.split(' ')[0]}!`, 'success');
      window.location.href = 'index.html';
    }, 500);
  });

  document.querySelectorAll('.toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => togglePasswordVisibility(btn));
  });

  const googleBtn = document.getElementById('google-login-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      showToast('Login Google memerlukan konfigurasi OAuth backend. Silakan gunakan email & password untuk demo ini.', 'info', 4200);
    });
  }

  const forgotLink = document.getElementById('forgot-password-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      const overlay = document.getElementById('forgot-overlay');
      if (overlay) openOverlay(overlay);
    });
  }

  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('Jika email terdaftar, tautan reset akan dikirim.', 'success');
      closeOverlay(document.getElementById('forgot-overlay'));
      forgotForm.reset();
    });
  }
}

/* ---------------- REGISTER ---------------- */
function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;
  redirectIfLoggedIn();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fields = {
      name: document.getElementById('field-name'),
      username: document.getElementById('field-username'),
      email: document.getElementById('field-reg-email'),
      password: document.getElementById('field-reg-password'),
      confirm: document.getElementById('field-confirm'),
    };
    Object.values(fields).forEach(clearFieldError);

    const name = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    let valid = true;
    if (name.length < 2) { setFieldError(fields.name, 'Nama minimal 2 karakter.'); valid = false; }
    if (!/^[a-zA-Z0-9_.]{3,}$/.test(username)) { setFieldError(fields.username, 'Username minimal 3 karakter (huruf/angka/_).'); valid = false; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setFieldError(fields.email, 'Format email tidak valid.'); valid = false; }
    if (password.length < 6) { setFieldError(fields.password, 'Password minimal 6 karakter.'); valid = false; }
    if (confirm !== password) { setFieldError(fields.confirm, 'Konfirmasi password tidak cocok.'); valid = false; }
    if (!valid) return;

    const result = ApisDB.createUser({ name, username, email, password });
    if (!result.ok) {
      showToast(result.error, 'error');
      if (result.error.includes('Email')) setFieldError(fields.email, result.error);
      if (result.error.includes('Username')) setFieldError(fields.username, result.error);
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = 'Membuat akun...';
    setTimeout(() => {
      ApisDB.setSession(email, true);
      showToast('Akun berhasil dibuat. Selamat datang!', 'success');
      window.location.href = 'index.html';
    }, 500);
  });

  document.querySelectorAll('.toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => togglePasswordVisibility(btn));
  });
}

function logout() {
  ApisDB.clearSession();
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginForm();
  initRegisterForm();
});
