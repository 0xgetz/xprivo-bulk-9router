<div align="center">

<img src="brand/logo.svg" alt="xPrivo Bulk → 9Router" width="520"/>

# xPrivo Bulk → 9Router

**Bulk-create anonymous xPrivo sessions and pool them into [9Router](https://9router.com) as a single OpenAI-compatible provider.**

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-0ea5e9.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-22c55e.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-94a3b8.svg)](#requirements)
[![9Router](https://img.shields.io/badge/9Router-OpenAI--compatible-7dd3fc.svg)](https://9router.com)
[![xPrivo](https://img.shields.io/badge/xPrivo-anonymous%20AI-8b5cf6.svg)](https://www.xprivo.com)

</div>

---

## What this does

[xPrivo](https://www.xprivo.com) is a free, anonymous AI chat that needs **no account** —
each visitor simply receives a short-lived session token (`sp_token`) in the browser.
This toolkit:

1. **Bulk-provisions sessions** — each one is an isolated browser context that solves
   xPrivo's Bot-shield challenge and harvests its `sp_token` + cookies.
2. **Pools them** behind one OpenAI-compatible endpoint with round-robin + failover.
3. **Connects the pool to 9Router**, exposing every xPrivo model under the `xprivo/` prefix.

> Requests are relayed **through the live browser contexts**, so they ride the same
> residential IP and solved challenge that minted each session.

## Features

- ✨ Zero runtime dependencies (pure Node ≥ 18)
- 🧩 Bulk session creator with a resumable `sessions.json` store
- 🔁 Round-robin or random routing with automatic failover
- 🌊 Streaming **and** non-streaming chat completions
- 🖥️ Launches its own Chromium, or reuses any existing `CDP_URL`
- 🔌 One-command 9Router registration (idempotent)
- 🌐 Proxy-aware for residential egress

## Requirements

- Node.js **18+**
- A Chromium/Chrome binary (auto-detected, or set `CHROME_PATH`)
- 9Router running locally (tested with **0.5.99**)
- **A residential IP or proxy** — xPrivo's shield rejects datacenter IPs

## Install

```bash
git clone https://github.com/0xgetz/xprivo-bulk-9router.git
cd xprivo-bulk-9router
# no npm install needed — zero dependencies
```

## Quick start

```bash
# 1. Create 3 anonymous sessions (launches its own Chromium)
node src/cli.js create --count 3

# 2. Verify each session answers
node src/cli.js test

# 3. Serve the OpenAI-compatible pool on :8791
node src/cli.js serve &

# 4. Register the pool into 9Router
node src/cli.js connect

# 5. Call it through 9Router
curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <router-key-from-step-4>" \
  -H "Content-Type: application/json" \
  -d '{"model":"xprivo/xprivo","messages":[{"role":"user","content":"hi"}]}'
```

### Using a proxy (recommended on servers)

```bash
node src/cli.js create --count 5 --proxy http://user:pass@host:port
```

### Reusing an existing browser

```bash
node src/cli.js create --count 5 --cdp ws://127.0.0.1:9222/devtools/browser/<id>
```

## Commands

| Command | Description |
| --- | --- |
| `create --count N` | Provision N anonymous sessions into `sessions.json` |
| `list` | Show stored sessions |
| `test` | Send a test prompt through every stored session |
| `serve` | Run the OpenAI-compatible pool adapter |
| `connect` | Register the adapter into 9Router and print a router key |
| `models` | Print the xPrivo model catalog |

Common flags: `--out FILE`, `--cdp WS_URL`, `--chrome PATH`, `--proxy URL`, `--headful`, `--port N`, `--router URL`, `--password PW`.

## Available models

Served by the adapter and exposed through 9Router as `xprivo/<model>`:

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

Free models work without any plan. **Premium/PRO** models may return an access or
rate-limit error on a free xPrivo tier — the catalog is fetched from xPrivo itself.

## Adapter endpoints

| Path | Method | Description |
| --- | --- | --- |
| `/v1/models` | GET | List all `xprivo/*` models |
| `/v1/chat/completions` | POST | Chat completion (stream + non-stream) |
| `/health` | GET | Pool + model counts |
| `/pool` | GET | Per-session status |
| `/pool/reload` | POST | Reload `sessions.json` and re-attach contexts |

## Configuration (`config.json`)

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

## How it works

See [STRUCTURE.md](STRUCTURE.md) for the architecture diagram and
[docs/PROTOCOL.md](docs/PROTOCOL.md) for the wire protocol.

## Notes & limitations

- **Residential IP required.** xPrivo's shield blocks datacenter IPs; run the creator
  from a residential connection or supply `--proxy`.
- Session tokens are short-lived and IP-bound — re-run `create` when they expire.
- Premium/PRO models are listed but may not be usable on a free tier.
- Use responsibly and in line with xPrivo's terms.

## License

[MIT](LICENSE) © 2026 0xgetz
