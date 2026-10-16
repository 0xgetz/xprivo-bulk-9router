# Wire Protocol

Two systems are involved: the **xPrivo** public API and the **9Router** admin API.

## 1. xPrivo (www.xprivo.com)

xPrivo is an anonymous, no-account AI chat. Its origin is behind the **Bunny Shield**
proof-of-work challenge, which blocks datacenter IPs — so the first contact must be a
real browser that solves the challenge and lands on the app.

### Session (the "account")

| Item | Where | Notes |
| --- | --- | --- |
| `sp_token` | `localStorage` | `<unix_ts>.<sha256>`, ~64 hex chars. Minted by the page on first visit. This is the per-session artifact. |
| `bunny_shield_id_16515` | cookie | Set by the challenge; `httpOnly`, `Secure`, session-only. |
| `theme`, `assistantIcon` | `localStorage` | UI preferences only. |

There is **no login, email, or password**. A fresh isolated browser context yields a
distinct `sp_token`, which is what makes bulk provisioning possible.

### Chat completion

```
POST https://www.xprivo.com/v1/chat/completions
Authorization: Bearer API_KEY_XPRIVO      # public placeholder shipped in the web bundle
Content-Type: application/json
x-api-version: 2
x-lang-chat: en
x-use-web: off

{"model":"xprivo","messages":[{"role":"user","content":"hi"}],"stream":true}
```

* The endpoint **always streams**; non-stream callers receive an empty body, so the
  adapter drains the SSE stream and re-frames it.
* Responses are SSE: `data: {choices:[{delta:{content}}]}` … then `data: [DONE]`.
* The default alias `xprivo` is answered by a backend that reports itself as
  `mistral-quantized` in the `model` field.

### Catalog

`GET https://www.xprivo.com/auth/pro-models?appversion=4.0.0&lang=en` (public) returns
the model metadata (name, `ispremium`, `exclusivity`, reasoning/audio flags). There is
no `/v1/models`; the adapter serves the catalog itself.

## 2. 9Router (http://127.0.0.1:20128)

```
POST /api/auth/login    {"password":"123456"}          -> Set-Cookie
POST /api/keys          {"name":"xprivo"}              -> {"key":"sk-..."}
POST /api/provider-nodes {"type":"openai-compatible",  -> {"node":{"id":"..."}}
        "apiType":"chat","prefix":"xprivo",
        "name":"xPrivo","baseUrl":"http://127.0.0.1:8791/v1"}
POST /api/providers     {"provider":"<NODE_ID>",       -> {"connection":{...}}
        "apiKey":"xprivo-pool","name":"xPrivo",
        "priority":1,"defaultModel":"xprivo/xprivo",
        "allowOverwrite":true}
```

* `provider` **must be the node ID** (`openai-compatible-chat-<uuid>`), not the prefix.
* `allowOverwrite:true` avoids a `409 PROVIDER_NAME_CONFLICT` on re-runs.
* Then `GET /v1/models` with the printed router key lists all `xprivo/*` models, and
  `POST /v1/chat/completions` routes through the pool.
