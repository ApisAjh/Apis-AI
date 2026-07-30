# Apis AI

Website AI Assistant modern — lihat `index.html`, `login.html`, `register.html`.

## Menjalankan tanpa backend (mode demo)

Buka `index.html` lewat server statis apa saja, misalnya:

```bash
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

Di mode ini, balasan AI memakai mesin demo bawaan (`generateAIReply()` di `js/chat.js`) dan data (akun, chat, tema) tersimpan di `localStorage` browser.

## Menyambungkan ke Google Gemini 2.5 Flash (backend sungguhan)

Backend memakai SDK resmi **`@google/genai`** dan model **`gemini-2.5-flash`**.

1. Buat API key di **https://aistudio.google.com/apikey** (Google AI Studio).
2. Masuk ke folder backend lalu pasang dependensinya:
   ```bash
   cd server
   npm install
   ```
3. Salin file environment lalu isi API key kamu:
   ```bash
   cp .env.example .env
   # buka .env, isi GEMINI_API_KEY=...
   ```
4. Jalankan server:
   ```bash
   npm start
   ```
5. Buka `http://localhost:3000` — server ini otomatis menyajikan frontend (`index.html`, dst.) **dan** endpoint `POST /api/chat`, jadi tidak perlu server statis terpisah.

Setelah backend aktif, `js/chat.js` (lewat `js/api.js`) otomatis memakai balasan asli dari Gemini. Kalau backend mati atau error (API key salah, kuota habis, dsb.), aplikasi **otomatis kembali** ke mesin balasan demo supaya chat tetap bisa dipakai — muncul notifikasi kecil sekali saat itu terjadi.

### Fitur backend

- **Endpoint tetap sama:** `POST /api/chat` — request/response shape kompatibel dengan versi sebelumnya (`{ text, usage }`), jadi tidak ada perubahan pada frontend selain `js/api.js`.
- **Chat history:** seluruh riwayat pesan di percakapan yang sedang dibuka dikirim sebagai `contents` bergaya Gemini (`role: "user"` / `"model"`), sehingga jawaban tetap mengikuti konteks obrolan.
- **Streaming response:** kirim `{ messages, stream: true }` ke `/api/chat` untuk mendapatkan balasan Server-Sent Events (SSE) potongan demi potongan, bukan satu balasan utuh. Sudah diimplementasikan penuh di backend maupun sebagai fungsi siap pakai `ApisAPI.sendChatStream(messages, onDelta)` di `js/api.js` — belum disambungkan ke tampilan chat secara default supaya UI/alur frontend tidak berubah, tapi tinggal dipanggil kapan pun kamu mau menampilkan efek mengetik karakter-per-karakter.
- **Image input (Vision):** saat pengguna mengirim gambar di chat, `js/api.js` mengirim data gambar (base64) ke backend, yang meneruskannya ke Gemini sebagai bagian `inlineData` — jadi Gemini benar-benar "melihat" gambarnya, bukan cuma tahu ada lampiran.

### Struktur backend

```
server/
├── server.js       → Express app: serve frontend + POST /api/chat (Gemini)
├── package.json    → dependensi: @google/genai, express, dotenv
└── .env.example    → salin ke .env, isi GEMINI_API_KEY kamu (jangan commit .env asli)
```

### Catatan keamanan

Jangan pernah memanggil Gemini API langsung dari kode di browser (`js/*.js`) dengan API key ditempel di situ — siapa pun yang membuka DevTools bisa mencuri key-mu. Selalu lewat backend seperti `server/server.js`, yang menyimpan key di `.env` (server-side, tidak terkirim ke browser).

### Menghubungkan database sungguhan (opsional, langkah lanjutan)

Saat ini akun & riwayat chat memakai `localStorage` (lihat `js/db.js`). Untuk sinkronisasi antar perangkat, ganti isi fungsi-fungsi di `js/db.js` agar memanggil Firebase Firestore / Supabase / API backend-mu sendiri — struktur fungsinya (createUser, getChats, addMessage, dst.) sudah dirancang supaya penggantian ini tidak memengaruhi bagian lain dari aplikasi.
