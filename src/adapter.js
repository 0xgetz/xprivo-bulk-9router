"use strict";
// OpenAI-compatible HTTP server backed by the xPrivo account pool.
//
//   POST /v1/chat/completions   (stream + non-stream, round-robin + failover)
//   GET  /v1/models
//   GET  /health
//   GET  /pool                  (account status)
//   POST /pool/reload
//
// Requests are relayed through live browser contexts so they ride the residential
// IP and the already-solved Bunny Shield challenge. On failure the next healthy
// account is tried.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool, chatInContext } = require("./pool");
const { connectCDP, MODEL_CATALOG } = require("./xprivo");
const { resolveCdp } = require("./launcher");

const ROOT = path.resolve(__dirname, "..");

function loadConfig() {
  const cfgPath = process.env.XPRIVO_CONFIG || path.join(ROOT, "config.json");
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
  return {
    port: Number(process.env.PORT || cfg.port || 8791),
    host: process.env.HOST || cfg.host || "127.0.0.1",
    prefix: cfg.modelPrefix || "xprivo",
    accountsFile: process.env.XPRIVO_ACCOUNTS || cfg.accountsFile || path.join(ROOT, "sessions.json"),
    routing: process.env.XPRIVO_ROUTING || cfg.routing || "round-robin",
    maxFailures: Number(process.env.XPRIVO_MAX_FAILURES || cfg.maxFailures || 3),
    cdpUrl: process.env.CDP_URL || cfg.cdpUrl || "",
    chromePath: process.env.CHROME_PATH || cfg.chromePath || "",
    proxy: process.env.XPRIVO_PROXY || cfg.proxy || "",
    models: cfg.models || MODEL_CATALOG,
  };
}

function messagesToXprivo(messages) {
  // xPrivo accepts the OpenAI message array directly; normalise content parts.
  return (messages || []).map((m) => {
    let content = m.content;
    if (Array.isArray(content)) content = content.map((c) => c.text || "").join("");
    return { role: m.role, content: content == null ? "" : String(content) };
  });
}

function resolveModel(models, requested) {
  if (!requested) return models.find((m) => !m.premium) || models[0];
  const norm = String(requested).replace(/^[^/]+\//, "");
  return models.find((m) => m.id === requested || m.id === norm) || models.find((m) => !m.premium) || models[0];
}

async function makeServer() {
  const cfg = loadConfig();
  const pool = new Pool({ file: cfg.accountsFile, routing: cfg.routing, maxFailures: cfg.maxFailures });

  // Connect to a browser (reuse CDP_URL or launch a local Chromium) and attach
  // one live context per pooled session.
  const { wsUrl, launched } = await resolveCdp({
    cdpUrl: cfg.cdpUrl,
    chromePath: cfg.chromePath,
    proxy: cfg.proxy,
    onLog: (m) => console.log("  " + m),
  });
  const { rawCall } = await connectCDP({ cdpUrl: wsUrl });
  await pool.attach(rawCall, { onLog: (m) => console.log("  " + m) });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    const json = (code, obj) => {
      res.writeHead(code, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (url.pathname === "/health") {
      return json(200, { status: "ok", accounts: pool.healthyCount, total: pool.size, models: cfg.models.length });
    }
    if (url.pathname === "/pool") return json(200, pool.info());
    if (url.pathname === "/pool/reload") {
      pool.load();
      await pool.attach(rawCall);
      return json(200, pool.info());
    }
    if (url.pathname === "/v1/models") {
      return json(200, {
        object: "list",
        data: cfg.models.map((m) => ({
          id: `${cfg.prefix}/${m.id}`,
          object: "model",
          created: 0,
          owned_by: "xprivo",
          name: m.name,
          premium: !!m.premium,
        })),
      });
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          return json(400, { error: { message: "invalid JSON" } });
        }
        const chosen = resolveModel(cfg.models, payload.model);
        const messages = messagesToXprivo(payload.messages);
        const wantStream = !!payload.stream || String(req.headers["accept"] || "").includes("text/event-stream");
        const id = "chatcmpl-" + Math.random().toString(36).slice(2);
        const created = Math.floor(Date.now() / 1000);
        const modelName = `${cfg.prefix}/${chosen.id}`;

        const cands = pool.candidates();
        if (!cands.length)
          return json(503, { error: { message: "no healthy xPrivo sessions in pool", type: "no_accounts" } });

        if (wantStream) {
          res.writeHead(200, {
            ...cors,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
          const chunk = (delta, finish = null) => ({
            id,
            object: "chat.completion.chunk",
            created,
            model: modelName,
            choices: [{ index: 0, delta, finish_reason: finish }],
          });
          send(chunk({ role: "assistant", content: "" }));

          let lastErr;
          for (const acct of cands) {
            try {
              const out = await chatInContext(acct.ctx, { model: chosen.id, messages, stream: true });
              acct.requests += 1;
              pool.markSuccess(acct);
              // xPrivo already streamed; we relay the finished text as a single delta.
              if (out.content) send(chunk({ content: out.content }));
              send(chunk({}, "stop"));
              res.write("data: [DONE]\n\n");
              return res.end();
            } catch (e) {
              lastErr = e;
              pool.markFailure(acct);
            }
          }
          send({ error: { message: lastErr ? lastErr.message : "all accounts failed" } });
          return res.end();
        }

        let lastErr;
        for (const acct of cands) {
          try {
            const out = await chatInContext(acct.ctx, { model: chosen.id, messages, stream: false });
            acct.requests += 1;
            pool.markSuccess(acct);
            return json(200, {
              id: "chatcmpl-xprivo",
              object: "chat.completion",
              created,
              model: out.model || modelName,
              choices: [{ index: 0, message: { role: "assistant", content: out.content }, finish_reason: "stop" }],
              usage: out.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
              x_xprivo_account: acct.id,
            });
          } catch (e) {
            lastErr = e;
            pool.markFailure(acct);
          }
        }
        json(502, { error: { message: lastErr ? lastErr.message : "all accounts failed" } });
      });
      return;
    }

    json(404, { error: { message: "not found" } });
  });

  const origClose = server.close.bind(server);
  server.close = (cb) => pool.dispose().then(() => origClose(cb));

  return { server, pool, cfg };
}

if (require.main === module) {
  makeServer()
    .then(({ server, pool, cfg }) => {
      server.listen(cfg.port, cfg.host, () => {
        console.log(
          `xPrivo pool adapter on http://${cfg.host}:${cfg.port}  (prefix="${cfg.prefix}", ${pool.healthyCount}/${pool.size} sessions, ${cfg.models.length} models)`
        );
      });
    })
    .catch((e) => {
      console.error("adapter failed:", e.message);
      process.exit(1);
    });
}

module.exports = { makeServer, messagesToXprivo, resolveModel };
