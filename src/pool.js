"use strict";
// xPrivo account pool.
//
// Because the xPrivo origin blocks datacenter IPs, a pooled account is a *live*
// isolated browser context (residential IP + solved Bunny Shield), not a plain
// HTTP client. `attach()` opens a context for each persisted session; `candidates()`
// returns healthy accounts round-robin for failover.

const fs = require("fs");
const path = require("path");
const { newContext, chatInContext } = require("./xprivo");

class Pool {
  constructor({ file, routing = "round-robin", maxFailures = 3 } = {}) {
    this.file = file;
    this.routing = routing;
    this.maxFailures = maxFailures;
    this.accounts = [];
    this.cursor = 0;
    this.rawCall = null;
    this.load();
  }

  load() {
    this.accounts = [];
    if (!this.file || !fs.existsSync(this.file)) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      data = null;
    }
    const list = Array.isArray(data) ? data : (data && data.accounts) || [];
    this.accounts = list.map((a) => ({
      id: a.id,
      sp_token: a.sp_token,
      cookies: a.cookies || [],
      ua: a.ua || null,
      createdAt: a.createdAt,
      status: "idle",
      failures: 0,
      ctx: null,
      requests: 0,
    }));
  }

  save() {
    if (!this.file) return;
    const out = {
      accounts: this.accounts.map((a) => ({
        id: a.id,
        sp_token: a.sp_token,
        cookies: a.cookies,
        ua: a.ua,
        createdAt: a.createdAt,
      })),
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(out, null, 2));
  }

  add(account) {
    this.accounts.push({
      failures: 0,
      requests: 0,
      ctx: null,
      ...account,
      status: "idle",
    });
    this.save();
  }

  // Opens a live browser context for every stored session (browser-level CDP call).
  async attach(rawCall, { onLog = () => {} } = {}) {
    this.rawCall = rawCall;
    for (const a of this.accounts) {
      if (a.ctx) continue;
      try {
        const ctx = await newContext(rawCall, { userAgent: a.ua });
        // prime the context so cookies/challenge are restored before first use
        await ctx.session.call("Page.navigate", { url: "https://www.xprivo.com/" });
        await new Promise((r) => setTimeout(r, 2500));
        a.ctx = ctx;
        a.status = "active";
        onLog("attached " + a.id);
      } catch (e) {
        a.status = "error";
        onLog("attach failed for " + a.id + ": " + e.message);
      }
    }
  }

  healthy() {
    return this.accounts.filter((a) => a.status !== "disabled" && a.failures < this.maxFailures && a.ctx);
  }

  candidates() {
    const ok = this.healthy();
    if (!ok.length) return [];
    if (this.routing === "random") return [...ok].sort(() => Math.random() - 0.5);
    const start = this.cursor % ok.length;
    this.cursor = (this.cursor + 1) % ok.length;
    return [...ok.slice(start), ...ok.slice(0, start)];
  }

  markFailure(a) {
    a.failures += 1;
    if (a.failures >= this.maxFailures) a.status = "degraded";
  }
  markSuccess(a) {
    a.failures = 0;
    if (a.status === "idle" || a.status === "degraded") a.status = "active";
  }

  markDead(a) {
    a.status = "dead";
  }

  get size() {
    return this.accounts.length;
  }
  get healthyCount() {
    return this.healthy().length;
  }

  info() {
    return {
      file: this.file,
      total: this.accounts.length,
      healthy: this.healthyCount,
      routing: this.routing,
      accounts: this.accounts.map((a) => ({
        id: a.id,
        status: a.status,
        failures: a.failures,
        requests: a.requests,
      })),
    };
  }

  async dispose() {
    for (const a of this.accounts) {
      if (a.ctx) {
        try {
          await a.ctx.dispose();
        } catch {
          /* ignore */
        }
        a.ctx = null;
      }
    }
  }
}

module.exports = { Pool, chatInContext };
