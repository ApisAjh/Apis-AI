/* =========================================================
   APIS AI — api/_lib/systemPrompt.js
   ---------------------------------------------------------
   Server-side only. Fetches the single active row from the
   `system_prompts` table in Supabase and returns its prompt
   text, for api/chat.js to use as systemInstruction.

   Security:
   - Uses SUPABASE_URL + SUPABASE_ANON_KEY only (never the
     service_role key). Read access is scoped by a Row Level
     Security policy on the table itself (see
     supabase/migrations/0001_system_prompts.sql), which only
     allows reading rows where is_active = true.
   - This file lives under /api, which Vercel runs server-side
     only. It is never bundled into or served to the browser.

   Resilience:
   - If Supabase env vars are missing, the request errors, or
     no active row exists, this silently falls back to
     FALLBACK_SYSTEM_PROMPT so Apis AI keeps working exactly
     as before this change — it never crashes the app.
   - Successful lookups are cached in-memory for a short TTL
     per warm Lambda instance, to avoid an extra network round
     trip on every single chat message.
   ========================================================= */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const CACHE_TTL_MS = 60 * 1000; // 1 minute
let cache = { prompt: null, fetchedAt: 0 };

/**
 * The exact prompt Apis AI used before this change. Used
 * whenever Supabase isn't configured, unreachable, or has no
 * active row — so behavior never regresses/crashes.
 */
const FALLBACK_SYSTEM_PROMPT = `Kamu adalah Apis AI, asisten AI yang ramah, jelas, dan membantu di dalam aplikasi chat bernama "Apis AI" (Development by Apis).
Jawab dalam Bahasa Indonesia kecuali pengguna menulis dalam bahasa lain.
Gunakan format markdown ringan (heading, list, code block, tabel) bila relevan agar mudah dibaca di dalam bubble chat.
Jika pengguna mengirim gambar, amati isinya dan jawab sesuai konteks gambar tersebut.`;

async function fetchActivePromptFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const url =
    `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/system_prompts` +
    `?select=prompt&is_active=eq.true&limit=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const prompt = rows[0]?.prompt;
    return typeof prompt === 'string' && prompt.trim() ? prompt : null;
  } catch (err) {
    console.error('Supabase system_prompts fetch failed, using fallback:', err?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns the active system prompt text. Never throws.
 */
async function getActiveSystemPrompt() {
  const now = Date.now();
  if (cache.prompt && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prompt;
  }

  const fetched = await fetchActivePromptFromSupabase();
  const prompt = fetched || FALLBACK_SYSTEM_PROMPT;

  // Only cache successful Supabase reads — if we just fell back,
  // keep retrying on the next request instead of caching the
  // fallback for a full minute.
  if (fetched) cache = { prompt, fetchedAt: now };

  return prompt;
}

module.exports = { getActiveSystemPrompt, FALLBACK_SYSTEM_PROMPT };
