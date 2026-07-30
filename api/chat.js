/* =========================================================
   APIS AI — /api/chat.js
   ---------------------------------------------------------
   Vercel Serverless Function (Node.js runtime).
   This REPLACES server/server.js's /api/chat route for
   production. Vercel auto-detects any file inside /api as a
   serverless function — no Express, no persistent process.

   Contract is unchanged from the Express version:
     POST /api/chat
       body:     { messages: [{ role, content, image? }], stream? }
       response: { text, usage }  — or Server-Sent Events when stream:true

   Required environment variable (set in Vercel dashboard,
   Project → Settings → Environment Variables — a .env file in
   the repo is NOT read in production):
     GEMINI_API_KEY   your key from https://aistudio.google.com/apikey
   Optional:
     GEMINI_MODEL     defaults to "gemini-3.5-flash"
     ALLOWED_ORIGIN   defaults to "*"
   ========================================================= */

const { GoogleGenAI } = require('@google/genai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const SYSTEM_PROMPT = `Kamu adalah Apis AI, asisten AI yang ramah, jelas, dan membantu di dalam aplikasi chat bernama "Apis AI" (Development by Apis).
Jawab dalam Bahasa Indonesia kecuali pengguna menulis dalam bahasa lain.
Gunakan format markdown ringan (heading, list, code block, tabel) bila relevan agar mudah dibaca di dalam bubble chat.
Jika pengguna mengirim gambar, amati isinya dan jawab sesuai konteks gambar tersebut.`;

// Reused across invocations within the same warm Lambda instance.
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

/** Same conversion used previously in server/server.js. */
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

/**
 * Vercel's Node runtime usually parses JSON bodies into req.body
 * automatically. This fallback covers the rare case where it
 * arrives unparsed (e.g. certain streaming/edge configurations).
 */
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, provider: 'gemini', model: GEMINI_MODEL, hasApiKey: Boolean(GEMINI_API_KEY) });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan, gunakan POST.' });
  }

  if (!ai) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY belum diatur di Vercel. Buka Project -> Settings -> Environment Variables, tambahkan GEMINI_API_KEY, lalu redeploy.',
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'Body request bukan JSON yang valid.' });
  }

  const { messages, stream } = body || {};
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
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 1024 },
  };

  // ---------- Streaming mode (Server-Sent Events) ----------
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
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
      res.write(`data: ${JSON.stringify({ error: err?.message || 'Gagal streaming dari Gemini API.' })}\n\n`);
      res.end();
    }
    return;
  }

  // ---------- Standard mode (single JSON response) ----------
  try {
    const response = await ai.models.generateContent(requestConfig);
    const text = response.text || '';
    return res.status(200).json({ text: text || '(Tidak ada teks pada respons.)', usage: response.usageMetadata || null });
  } catch (err) {
    console.error('Gemini API error:', err);
    const status = Number.isInteger(err?.status) ? err.status : 502;
    return res.status(status).json({ error: err?.message || 'Gagal menghubungi Gemini API.' });
  }
};
