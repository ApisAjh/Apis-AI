/* =========================================================
   APIS AI — api.js
   ---------------------------------------------------------
   Talks to the backend proxy at POST /api/chat (see
   server/server.js), which now runs on Google Gemini 2.5
   Flash via the @google/genai SDK. The request/response
   contract used by sendChat() below is unchanged from the
   previous (Claude-backed) version, so chat.js did not need
   any changes.

   If the backend isn't running (e.g. you're just opening
   index.html directly, or haven't set up server/ yet), calls
   fail fast and chat.js falls back to the built-in demo reply
   engine automatically — so the app always works, with or
   without a backend.
   ========================================================= */

const ApisAPI = (() => {
  const ENDPOINT = '/api/chat';

  /**
   * Pulls the base64 payload + mime type out of a data: URL
   * (e.g. "data:image/png;base64,iVBORw0...") as produced by
   * FileReader.readAsDataURL() in upload.js. Returns null if the
   * string isn't a data URL.
   */
  function parseDataUrl(dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
  }

  /**
   * Converts this app's internal chat message objects into the
   * {role, content, image?} shape the backend expects.
   *   - text messages           -> { role, content }
   *   - image messages (Vision) -> { role, content, image: {mimeType, data} }
   *   - file / voice messages   -> short text placeholder for context
   *     (extend here if you want to actually transcribe/parse them)
   */
  function toApiHistory(messages) {
    return messages
      .map((m) => {
        let content = m.text || '';
        let image = null;

        if (m.type === 'image') {
          image = parseDataUrl(m.imageData);
          if (!content) content = 'Tolong lihat dan jelaskan gambar ini.';
        } else if (m.type === 'file') {
          content = `[Pengguna mengirim file: ${m.fileMeta?.name || 'file'}]`;
        } else if (m.type === 'voice') {
          content = '[Pengguna mengirim pesan suara]';
        }

        if (!content && !image) return null;
        const entry = { role: m.role === 'ai' ? 'assistant' : 'user', content };
        if (image) entry.image = image;
        return entry;
      })
      .filter(Boolean);
  }

  /**
   * Sends the conversation so far to the backend and returns the
   * assistant's reply text (non-streaming). Throws on any failure
   * (network error, missing backend, missing API key, Gemini API
   * error, etc.) — callers should catch and fall back to the demo
   * engine, which is exactly what chat.js already does.
   */
  async function sendChat(messages) {
    const history = toApiHistory(messages);
    if (history.length === 0) throw new Error('Tidak ada pesan untuk dikirim.');

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Backend merespons dengan format tak terduga (status ${res.status}).`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Backend merespons dengan status ${res.status}.`);
    }
    return data.text;
  }

  /**
   * Optional streaming variant: same request, but the backend replies
   * with Server-Sent Events (one { delta } chunk at a time, ending
   * with { done: true, text }). Not currently wired into chat.js's
   * render flow (kept out on purpose to leave the existing UI/flow
   * untouched), but fully functional — call it directly if you want
   * to stream tokens into the UI yourself, e.g.:
   *
   *   ApisAPI.sendChatStream(messages, (delta) => bubble.textContent += delta)
   *     .then((fullText) => { ... });
   */
  async function sendChatStream(messages, onDelta) {
    const history = toApiHistory(messages);
    if (history.length === 0) throw new Error('Tidak ada pesan untuk dikirim.');

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, stream: true }),
    });

    if (!res.ok || !res.body) {
      let errMsg = `Backend merespons dengan status ${res.status}.`;
      try { const data = await res.json(); if (data.error) errMsg = data.error; } catch { /* ignore */ }
      throw new Error(errMsg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop(); // keep any incomplete trailing event in the buffer

      for (const evt of events) {
        const line = evt.trim();
        if (!line.startsWith('data:')) continue;
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.error) throw new Error(payload.error);
        if (payload.delta) {
          fullText += payload.delta;
          if (onDelta) onDelta(payload.delta, fullText);
        }
        if (payload.done) {
          fullText = payload.text ?? fullText;
        }
      }
    }
    return fullText;
  }

  return { sendChat, sendChatStream };
})();
