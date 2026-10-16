"use strict";
// xPrivo account provisioner.
//
// xPrivo (https://www.xprivo.com) needs no email, password or login. Its public
// site is protected by the Bunny Shield proof-of-work challenge, which blocks
// datacenter IPs, so an "account" is simply one isolated browser context that:
//
//   1. loads https://www.xprivo.com/ (solves Bunny Shield, plants cookies)
//   2. receives a freshly minted `sp_token` in localStorage
//
// That context — its cookies + sp_token — is the reusable session. Every request
// is later relayed through the same context so the traffic rides the browser's
// residential IP and the solved challenge.
//
// A provisioned account is persisted as { id, sp_token, cookies, ua, createdAt }.

const { connectCDP, evaluate } = require("./cdp");

const SITE = "https://www.xprivo.com/";
const READY_TIMEOUT_MS = 45000;
const POLL_MS = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Attaches a brand-new isolated browser context and returns helpers to drive it.
async function newContext(rawCall, { userAgent } = {}) {
  const { browserContextId } = await rawCall("Target.createBrowserContext", {});
  const uaOverride = userAgent
    ? `Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(userAgent)}})`
    : null;
  const { targetId } = await rawCall("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await rawCall("Target.attachToTarget", { targetId, flatten: true });
  await rawCall("Runtime.enable", {}, sessionId);
  await rawCall("Page.enable", {}, sessionId);
  await rawCall("Network.enable", {}, sessionId);
  if (uaOverride) await rawCall("Page.addScriptToEvaluateOnNewDocument", { source: uaOverride }, sessionId);

  const session = {
    call: (m, p) => rawCall(m, p, sessionId),
    Network: { getCookies: (p) => rawCall("Network.getCookies", p, sessionId) },
  };
  return {
    browserContextId,
    targetId,
    sessionId,
    session,
    async dispose() {
      try {
        await rawCall("Target.closeTarget", { targetId });
      } catch {
        /* ignore */
      }
      try {
        await rawCall("Target.disposeBrowserContext", { browserContextId });
      } catch {
        /* ignore */
      }
    },
  };
}

// Loads the site until an sp_token appears in localStorage (the "account").
async function mintSession(ctx, { onLog = () => {} } = {}) {
  const { session } = ctx;
  onLog("loading site + solving Bunny Shield");
  await session.call("Page.navigate", { url: SITE });

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    let probe;
    try {
      probe = await evaluate(
        session,
        `(() => ({
           title: document.title,
           ready: document.readyState,
           token: localStorage.getItem('sp_token')
         }))()`
      );
    } catch {
      continue;
    }
    if (probe && probe.token) return probe.token;
  }
  throw new Error("timed out waiting for sp_token (Bunny Shield may not have solved)");
}

async function collectCookies(ctx) {
  try {
    const { cookies } = await ctx.session.Network.getCookies({ urls: [SITE] });
    return cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, httpOnly: c.httpOnly, secure: c.secure }));
  } catch {
    return [];
  }
}

const MODEL_CATALOG = [
  { id: "xprivo", name: "xPrivo (default alias)", premium: false, reasoning: false, audio: false, exclusivity: "free" },
  { id: "kolibri", name: "Kolibri (Aleph Alpha)", premium: false, reasoning: false, audio: false, exclusivity: "free" },
  { id: "kolibri-low", name: "Kolibri Lite (Aleph Alpha)", premium: false, reasoning: true, audio: false, exclusivity: "free" },
  { id: "kolibri-medium", name: "Kolibri Medium (Aleph Alpha)", premium: false, reasoning: true, audio: false, exclusivity: "free" },
  { id: "glm-5.3-flash", name: "GLM 5.3 Flash", premium: false, reasoning: false, audio: false, exclusivity: "free" },
  { id: "mistral-4-large", name: "Mistral 4 | Le Chonk", premium: true, reasoning: false, audio: false, exclusivity: "free" },
  { id: "deepseek-v4", name: "DeepSeek V4.1 Flash", premium: true, reasoning: false, audio: false, exclusivity: "pro" },
  { id: "minimax-m3", name: "MiniMax M3", premium: true, reasoning: false, audio: false, exclusivity: "lax" },
  { id: "kimi-k2.7", name: "Kimi K3.0", premium: true, reasoning: false, audio: false, exclusivity: "pro" },
  { id: "mistral-3", name: "Mistral 3", premium: true, reasoning: false, audio: false, exclusivity: "pro" },
  { id: "gpt-6.1-sol", name: "GPT 6.1 Sol", premium: true, reasoning: true, audio: false, exclusivity: "pro" },
  { id: "gpt-5.2", name: "GPT 5.2", premium: true, reasoning: false, audio: false, exclusivity: "pro" },
  { id: "gemini-3-pro", name: "Gemini 3.1 PRO", premium: true, reasoning: false, audio: true, exclusivity: "pro" },
  { id: "gemini-3-pro-thinking", name: "Gemini 3.1 PRO", premium: true, reasoning: true, audio: true, exclusivity: "pro" },
];

// Runs a chat completion inside an already-open context, relaying through its IP
// and cookie jar. Returns { content, model, usage }.
async function chatInContext(ctx, { model = "xprivo", messages, stream = false, web = false } = {}) {
  const { session } = ctx;
  const payload = JSON.stringify({
    model,
    messages,
    stream: true,
  });
  const expr = `(async () => {
    const res = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer API_KEY_XPRIVO',
        'x-api-version': '2',
        'x-lang-chat': 'en',
        'x-use-web': ${web ? "'on'" : "'off'"}
      },
      body: ${JSON.stringify(payload)}
    });
    const raw = await res.text();
    let content = '', realModel = ${JSON.stringify(model)}, usage = null;
    for (const line of raw.split('\\n')) {
      if (!line.startsWith('data:')) continue;
      const p = line.slice(5).trim();
      if (p === '[DONE]') continue;
      let o; try { o = JSON.parse(p); } catch { continue; }
      if (o.model) realModel = o.model;
      if (o.usage) usage = o.usage;
      const d = o.choices && o.choices[0] && o.choices[0].delta;
      if (d && typeof d.content === 'string') content += d.content;
    }
    return { status: res.status, content, model: realModel, usage };
  })()`;
  const out = await evaluate(session, expr);
  if (!out || out.status !== 200) throw new Error("chat failed: HTTP " + (out && out.status));
  return out;
}

// Provision a single anonymous xPrivo session.
async function provisionAccount(rawCall, { userAgent, onLog = () => {}, keepOpen = false } = {}) {
  const ctx = await newContext(rawCall, { userAgent });
  try {
    const sp_token = await mintSession(ctx, { onLog });
    const cookies = await collectCookies(ctx);
    onLog("session ready: " + sp_token.slice(0, 24) + "…");
    return { account: { id: sp_token.split(".")[0] + "-" + Math.random().toString(36).slice(2, 8), sp_token, cookies, ua: userAgent || null, createdAt: new Date().toISOString() }, ctx };
  } finally {
    if (!keepOpen) await ctx.dispose();
  }
}

module.exports = {
  SITE,
  MODEL_CATALOG,
  connectCDP,
  newContext,
  mintSession,
  collectCookies,
  provisionAccount,
  chatInContext,
  evaluate: require("./cdp").evaluate,
  sleep,
};
