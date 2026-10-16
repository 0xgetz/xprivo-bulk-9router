# Project Structure

```
xprivo-bulk-9router/
├── src/
│   ├── cli.js               # command-line entry point (create/list/test/serve/connect/models)
│   ├── launcher.js          # find + launch a local Chromium, or reuse a CDP endpoint
│   ├── cdp.js               # zero-dependency Chrome DevTools Protocol transport
│   ├── xprivo.js            # session provisioner: mint sp_token + read cookies, relay chat
│   ├── pool.js              # account pool: live contexts, round-robin, failover
│   ├── adapter.js           # OpenAI-compatible HTTP server backed by the pool
│   └── connect-9router.js   # register the adapter as a 9Router provider
├── docs/
│   └── PROTOCOL.md          # wire protocol notes (xPrivo API + 9Router admin API)
├── brand/
│   ├── logo.svg             # project logo
│   └── icon.svg             # project icon
├── config.json              # adapter defaults (port, prefix, routing)
├── package.json             # metadata + npm scripts (no runtime dependencies)
├── README.md                # English
├── README.id.md             # Indonesian
├── README.zh.md             # Chinese
├── README.ja.md             # Japanese
├── README.es.md             # Spanish
├── STRUCTURE.md             # this file
└── LICENSE                  # MIT
```

## Data flow

```
                +-----------------------+         +---------------------------+
                |  xprivo-bulk CLI      |         |  xPrivo (www.xprivo.com)  |
                |  `create --count N`   |         |  public API + Bunny Shield|
                +-----------+-----------+         +-------------+-------------+
                            |                                     ^
             launches / reuses Chromium (CDP)                     |
                            v                                     |
        +-----------------------------------------+               |
        |  One isolated BROWSER CONTEXT per        |  navigate +   |
        |  account: solves Bunny Shield, mints     |  fetch relay  |
        |  sp_token in localStorage                |---------------+
        +-------------------+---------------------+               |
                            |  sessions.json (sp_token + cookies) |
                            v                                     |
        +-----------------------------------------+               |
        |  pool.js  ->  adapter.js (:8791)         |  POST /v1/chat/completions
        |  OpenAI-compatible server                |---------------+
        |  round-robin + failover across contexts  |
        +-------------------+---------------------+
                            |  /v1
                            v
        +-----------------------------------------+
        |  9Router (http://127.0.0.1:20128)        |
        |  provider node "xprivo" -> 14 models     |
        +-----------------------------------------+
```

## Module responsibilities

| Module | Responsibility |
| --- | --- |
| `launcher.js` | Locate Chromium (`CHROME_PATH`/auto-detect) or reuse `CDP_URL`; launch headless with an optional proxy. |
| `cdp.js` | Speak raw CDP over a hand-rolled RFC6455 WebSocket; create browser contexts and evaluate JS. |
| `xprivo.js` | Provision a session (solve challenge + read `sp_token`), relay chat inside a context, expose the model catalog. |
| `pool.js` | Keep one live context per stored session; serve `candidates()` round-robin and track failures. |
| `adapter.js` | OpenAI-compatible surface: `/v1/chat/completions`, `/v1/models`, `/health`, `/pool`. |
| `connect-9router.js` | Log into 9Router, create/replace the provider node, register the connection, mint a router key. |
