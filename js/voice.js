/* =========================================================
   APIS AI — voice.js
   Voice message recording (MediaRecorder) + WhatsApp-style
   playback bubble with simple waveform.
   ========================================================= */

const ApisVoice = (() => {
  let mediaRecorder = null;
  let audioChunks = [];
  let stream = null;
  let startTime = 0;
  let pausedAt = 0;
  let timerInterval = null;
  let state = 'idle'; // idle | recording | paused

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Perangkat ini tidak mendukung perekaman suara.', 'error');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      showToast('Izin mikrofon ditolak. Aktifkan izin untuk merekam suara.', 'error');
      return;
    }
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.start();
    state = 'recording';
    startTime = Date.now();
    pausedAt = 0;
    showRecordingBar();
    startTimer();
  }

  function pauseRecording() {
    if (state !== 'recording') return;
    mediaRecorder.pause();
    state = 'paused';
    pausedAt += Date.now() - startTime;
    stopTimer();
    updateRecordingBarState();
  }

  function resumeRecording() {
    if (state !== 'paused') return;
    mediaRecorder.resume();
    state = 'recording';
    startTime = Date.now();
    startTimer();
    updateRecordingBarState();
  }

  function stopRecording(send) {
    if (!mediaRecorder) return;
    stopTimer();
    const finalMs = pausedAt + (state === 'recording' ? Date.now() - startTime : 0);
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (send && audioChunks.length) {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const duration = formatDuration(finalMs / 1000);
          ApisChat.sendVoiceMessage(reader.result, duration);
        };
        reader.readAsDataURL(blob);
      }
      state = 'idle';
      hideRecordingBar();
    };
    mediaRecorder.stop();
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const elapsed = (pausedAt + (Date.now() - startTime)) / 1000;
      const timeEl = document.getElementById('rec-time');
      if (timeEl) timeEl.textContent = formatDuration(elapsed);
    }, 200);
  }
  function stopTimer() { clearInterval(timerInterval); }

  function showRecordingBar() {
    document.getElementById('composer-normal').classList.add('hidden');
    document.getElementById('recording-bar').classList.remove('hidden');
    document.getElementById('rec-time').textContent = '0:00';
    buildRecWaveform();
    updateRecordingBarState();
  }
  function hideRecordingBar() {
    document.getElementById('composer-normal').classList.remove('hidden');
    document.getElementById('recording-bar').classList.add('hidden');
  }
  function buildRecWaveform() {
    const wave = document.getElementById('rec-wave');
    wave.innerHTML = Array.from({ length: 32 }, (_, i) =>
      `<span style="height:${10 + Math.round(Math.random() * 18)}px; animation-delay:${(i % 8) * 0.08}s;"></span>`
    ).join('');
  }
  function updateRecordingBarState() {
    const pauseBtn = document.getElementById('rec-pause-btn');
    if (!pauseBtn) return;
    pauseBtn.innerHTML = state === 'paused' ? playIcon() : pauseIcon();
    pauseBtn.title = state === 'paused' ? 'Lanjutkan' : 'Jeda';
  }

  function playIcon() { return `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>`; }
  function pauseIcon() { return `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; }

  /* ---------- Playback for sent voice bubbles ---------- */
  function wirePlayback(row, message) {
    const bubbleWrap = row.querySelector('.voice-bubble');
    const btn = row.querySelector('.voice-play-btn');
    const bars = row.querySelectorAll('.voice-wave span');
    let audio = null;
    let playing = false;

    btn.addEventListener('click', () => {
      if (!audio) {
        audio = new Audio(message.audioData);
        audio.addEventListener('timeupdate', () => {
          const pct = audio.currentTime / (audio.duration || 1);
          const activeCount = Math.floor(pct * bars.length);
          bars.forEach((b, i) => b.classList.toggle('played', i < activeCount));
        });
        audio.addEventListener('ended', () => {
          playing = false;
          btn.innerHTML = playIcon();
          bars.forEach(b => b.classList.remove('played'));
        });
      }
      if (playing) {
        audio.pause();
        playing = false;
        btn.innerHTML = playIcon();
      } else {
        audio.play();
        playing = true;
        btn.innerHTML = pauseIcon();
      }
    });
  }

  function init() {
    const micBtn = document.getElementById('mic-btn');
    micBtn?.addEventListener('click', startRecording);
    document.getElementById('rec-pause-btn')?.addEventListener('click', () => {
      if (state === 'recording') pauseRecording();
      else resumeRecording();
    });
    document.getElementById('rec-cancel-btn')?.addEventListener('click', () => stopRecording(false));
    document.getElementById('rec-send-btn')?.addEventListener('click', () => stopRecording(true));
  }

  return { init, wirePlayback };
})();
