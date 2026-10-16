<div align="center">

<img src="brand/logo.svg" alt="xPrivo Bulk → 9Router" width="520"/>

# xPrivo Bulk → 9Router

**Buat banyak sesi xPrivo anonim sekaligus, lalu satukan ke [9Router](https://9router.com) sebagai satu provider yang kompatibel OpenAI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-0ea5e9.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-22c55e.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-94a3b8.svg)](#kebutuhan)
[![9Router](https://img.shields.io/badge/9Router-OpenAI--compatible-7dd3fc.svg)](https://9router.com)
[![xPrivo](https://img.shields.io/badge/xPrivo-anonymous%20AI-8b5cf6.svg)](https://www.xprivo.com)

</div>

---

## Apa yang dilakukan proyek ini

[xPrivo](https://www.xprivo.com) adalah chat AI anonim dan gratis yang **tidak butuh akun** —
tiap pengunjung cukup menerima token sesi berumur pendek (`sp_token`) di browser. Toolkit ini:

1. **Membuat sesi secara massal** — setiap sesi adalah konteks browser terisolasi yang
   menaklukkan tantangan Bot-shield xPrivo lalu mengambil `sp_token` + cookie-nya.
2. **Menyatukannya** di balik satu endpoint kompatibel OpenAI dengan round-robin + failover.
3. **Menghubungkan pool ke 9Router**, sehingga semua model xPrivo tersedia di prefix `xprivo/`.

> Permintaan diteruskan **lewat konteks browser yang aktif**, jadi memakai IP residensial dan
> tantangan yang sudah selesai sama seperti saat sesi dibuat.

## Fitur

- ✨ Tanpa dependensi runtime (Node ≥ 18 murni)
- 🧩 Pembuat sesi massal dengan penyimpanan `sessions.json` yang bisa dilanjutkan
- 🔁 Perutean round-robin atau acak dengan failover otomatis
- 🌊 Chat completion streaming **dan** non-streaming
- 🖥️ Menjalankan Chromium sendiri, atau memakai `CDP_URL` yang ada
- 🔌 Pendaftaran ke 9Router satu perintah (idempoten)
- 🌐 Mendukung proxy untuk koneksi residensial

## Kebutuhan

- Node.js **18+**
- Biner Chromium/Chrome (terdeteksi otomatis, atau set `CHROME_PATH`)
- 9Router berjalan lokal (diuji pada **0.5.99**)
- **IP residensial atau proxy** — shield xPrivo menolak IP datacenter

## Instalasi

```bash
git clone https://github.com/0xgetz/xprivo-bulk-9router.git
cd xprivo-bulk-9router
# tidak perlu npm install — tanpa dependensi
```

## Mulai cepat

```bash
# 1. Buat 3 sesi anonim (menjalankan Chromium sendiri)
node src/cli.js create --count 3

# 2. Uji tiap sesi
node src/cli.js test

# 3. Jalankan pool kompatibel OpenAI di :8791
node src/cli.js serve &

# 4. Daftarkan pool ke 9Router
node src/cli.js connect

# 5. Panggil lewat 9Router
curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <router-key-dari-langkah-4>" \
  -H "Content-Type: application/json" \
  -d '{"model":"xprivo/xprivo","messages":[{"role":"user","content":"hai"}]}'
```

### Memakai proxy (disarankan di server)

```bash
node src/cli.js create --count 5 --proxy http://user:pass@host:port
```

### Memakai browser yang sudah ada

```bash
node src/cli.js create --count 5 --cdp ws://127.0.0.1:9222/devtools/browser/<id>
```

## Perintah

| Perintah | Keterangan |
| --- | --- |
| `create --count N` | Membuat N sesi anonim ke `sessions.json` |
| `list` | Menampilkan sesi tersimpan |
| `test` | Mengirim prompt uji ke setiap sesi |
| `serve` | Menjalankan adapter pool kompatibel OpenAI |
| `connect` | Mendaftarkan adapter ke 9Router dan mencetak router key |
| `models` | Menampilkan katalog model xPrivo |

Flag umum: `--out FILE`, `--cdp WS_URL`, `--chrome PATH`, `--proxy URL`, `--headful`, `--port N`, `--router URL`, `--password PW`.

## Model yang tersedia

Dilayani oleh adapter dan tersedia di 9Router sebagai `xprivo/<model>`:

| Model ID | Display name | Tier | Reasoning | Audio |
| --- | --- | --- | --- | --- |
| `xprivo` | xPrivo (default alias) | Free | – | – |
| `kolibri` | Kolibri (Aleph Alpha) | Free | – | – |
| `kolibri-low` | Kolibri Lite (Aleph Alpha) | Free | ✓ | – |
| `kolibri-medium` | Kolibri Medium (Aleph Alpha) | Free | ✓ | – |
| `glm-5.3-flash` | GLM 5.3 Flash | Free | – | – |
| `mistral-4-large` | Mistral 4 \| Le Chonk | Premium | – | – |
| `deepseek-v4` | DeepSeek V4.1 Flash | PRO | – | – |
| `minimax-m3` | MiniMax M3 | Lax | – | – |
| `kimi-k2.7` | Kimi K3.0 | PRO | – | – |
| `mistral-3` | Mistral 3 | PRO | – | – |
| `gpt-6.1-sol` | GPT 6.1 Sol | PRO | ✓ | – |
| `gpt-5.2` | GPT 5.2 | PRO | – | – |
| `gemini-3-pro` | Gemini 3.1 PRO | PRO | – | ✓ |
| `gemini-3-pro-thinking` | Gemini 3.1 PRO | PRO | ✓ | ✓ |

Model **Free** bisa dipakai tanpa paket. Model **Premium/PRO** bisa mengembalikan
error akses atau rate-limit pada tier gratis xPrivo — katalog diambil langsung dari xPrivo.

## Endpoint adapter

| Path | Metode | Keterangan |
| --- | --- | --- |
| `/v1/models` | GET | Daftar semua model `xprivo/*` |
| `/v1/chat/completions` | POST | Chat completion (stream + non-stream) |
| `/health` | GET | Jumlah pool + model |
| `/pool` | GET | Status tiap sesi |
| `/pool/reload` | POST | Muat ulang `sessions.json` dan pasang ulang konteks |

## Konfigurasi (`config.json`)

```json
{
  "port": 8791,
  "host": "127.0.0.1",
  "modelPrefix": "xprivo",
  "accountsFile": "sessions.json",
  "routing": "round-robin",
  "maxFailures": 3
}
```

## Cara kerja

Lihat [STRUCTURE.md](STRUCTURE.md) untuk diagram arsitektur dan
[docs/PROTOCOL.md](docs/PROTOCOL.md) untuk protokol komunikasi.

## Catatan & batasan

- **Wajib IP residensial.** Shield xPrivo memblokir IP datacenter; jalankan pembuat sesi
  dari koneksi residensial atau beri `--proxy`.
- Token sesi berumur pendek dan terikat IP — jalankan `create` lagi saat kedaluwarsa.
- Model Premium/PRO terdaftar tetapi mungkin tidak bisa dipakai pada tier gratis.
- Gunakan dengan bertanggung jawab dan sesuai ketentuan xPrivo.

## Lisensi

[MIT](LICENSE) © 2026 0xgetz
