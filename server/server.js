/* =========================================================
   APIS AI — Backend server (server.js)
   ---------------------------------------------------------
   Migrated from Anthropic Claude to Google Gemini 3.5 Flash
   using the official @google/genai SDK.

   Jobs:
     1. Serve the static frontend (index.html, css/, js/)
     2. Expose POST /api/chat — same contract as before:
          request:  { messages: [{ role, content, image? }] }
          response: { text, usage }
        Now backed by Gemini instead of Claude.
     3. Optional streaming: send { ..., stream: true } in the
        request body to receive a text/event-stream (SSE) of
        incremental chunks instead of a single JSON reply.
     4. Vision: a message can include `image: { mimeType, data }`
        (data = base64, no "data:...;base64," prefix) and it will
        be sent to Gemini as inline image data alongside the text.

   Setup:
     cd server
     npm install
     cp .env.example .env      # then paste your real Gemini API key
     npm start
     → open http://localhost:3000

   Requires Node.js 18+.
   ========================================================= */

require('dotenv').config();
const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const SYSTEM_PROMPT = `Kamu adalah Apis AI, asisten AI yang ramah, jelas, dan membantu di dalam aplikasi chat bernama "Apis AI" (Development by Apis).
Jawab dalam Bahasa Indonesia kecuali pengguna menulis dalam bahasa lain.
Gunakan format markdown ringan (heading, list, code block, tabel) bila relevan agar mudah dibaca di dalam bubble chat.
Jika pengguna mengirim gambar, amati isinya dan jawab sesuai konteks gambar tersebut.`;

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

app.use(express.json({ limit: '20mb' })); // generous limit so base64 image attachments fit

// Basic CORS so the frontend can be hosted separately from this API if needed.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve the static site (index.html, login.html, css/, js/) from the project root,
// so you can just run this one server and open http://localhost:3000 directly.
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, provider: 'gemini', model: GEMINI_MODEL, hasApiKey: Boolean(GEMINI_API_KEY) });
});

/**
 * Converts this app's {role, content, image?} history into Gemini's
 * `contents: [{ role, parts }]` shape.
 *   - role "assistant" -> "model" (Gemini's name for the AI turn)
 *   - role "user"       -> "user"
 *   - content            -> a { text } part
 *   - image {mimeType,data} -> an { inlineData } part (Vision input)
 */
function toGeminiContents(messages) {
  return messages
    .map((m) => {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      if (m.image && m.image.data) {
        parts.push({ inlineData: { mimeType: m.image.mimeType || 'image/jpeg', data: m.image.data } });
      }
      if (parts.length === 0) return null;
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    })
    .filter(Boolean);
}

app.post('/api/chat', async (req, res) => {
  if (!ai) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY belum diatur. Salin server/.env.example ke server/.env dan isi API key kamu, lalu restart server.',
    });
  }

  const { messages, stream } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Payload "messages" kosong atau tidak valid.' });
  }

  const contents = toGeminiContents(messages);
  if (contents.length === 0) {
    return res.status(400).json({ error: 'Tidak ada konten valid (teks/gambar) pada pesan.' });
  }

  const requestConfig = {
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 1024,
    },
  };

  // ---------- Streaming mode (Server-Sent Events) ----------
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const streamResult = await ai.models.generateContentStream(requestConfig);
      let fullText = '';
      for await (const chunk of streamResult) {
        const delta = chunk.text || '';
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true, text: fullText })}\n\n`);
      res.end();
    } catch (err) {
      console.error('Gemini streaming error:', err);
      const message = err?.message || 'Gagal menghubungi Gemini API saat streaming.';
      // Headers are already sent in SSE mode, so report the error as an SSE event.
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
    return;
  }

  // ---------- Standard mode (single JSON response) ----------
  try {
    const response = await ai.models.generateContent(requestConfig);
    const text = response.text || '';
    res.json({ text: text || '(Tidak ada teks pada respons.)', usage: response.usageMetadata || null });
  } catch (err) {
    console.error('Gemini API error:', err);
    const status = Number.isInteger(err?.status) ? err.status : 502;
    res.status(status).json({ error: err?.message || 'Gagal menghubungi Gemini API.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Apis AI backend (Gemini) berjalan di http://localhost:${PORT}`);
  console.log(`  Model aktif: ${GEMINI_MODEL}`);
  console.log(GEMINI_API_KEY ? '  ✓ GEMINI_API_KEY terdeteksi.\n' : '  ⚠ GEMINI_API_KEY belum diatur — lihat server/.env.example\n');
});
