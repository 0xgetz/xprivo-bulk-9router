"use strict";
// xPrivo bulk account (session) creator + pool manager CLI.
//
//   node src/cli.js create --count 3 [--out sessions.json] [--cdp <ws-url>]
//   node src/cli.js list   [--out sessions.json]
//   node src/cli.js test   [--out sessions.json] [--cdp <ws-url>] [--model xprivo]
//   node src/cli.js connect [--router http://127.0.0.1:20128]
//   node src/cli.js serve  [--out sessions.json] [--port 8791] [--cdp <ws-url>]
//
// A "session" is one isolated browser context that has solved xPrivo's Bunny
// Shield and holds a freshly minted sp_token. The pool relays chat requests
// through those contexts so they ride the residential IP.

const fs = require("fs");
const path = require("path");
const {
  connectCDP,
  provisionAccount,
  chatInContext,
  MODEL_CATALOG,
} = require("./xprivo");
const { resolveCdp } = require("./launcher");
const { Pool } = require("./pool");

const ROOT = path.resolve(__dirname, "..");

// Resolve a CDP endpoint: reuse --cdp/$CDP_URL, else launch a local Chromium.
async function openBrowser(args) {
  const { wsUrl, launched } = await resolveCdp({
    cdpUrl: args.cdp,
    chromePath: args.chrome,
    proxy: args.proxy,
    headless: args.headful ? false : true,
    onLog: (m) => console.error("  " + m),
  });
  const { rawCall } = await connectCDP({ cdpUrl: wsUrl });
  return { rawCall, launched };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function outFile(args) {
  return path.resolve(args.out || path.join(ROOT, "sessions.json"));
}

async function readSessions(file) {
  if (!fs.existsSync(file)) return [];
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(d) ? d : d.accounts || [];
  } catch {
    return [];
  }
}

function writeSessions(file, accounts) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ accounts }, null, 2));
}

async function cmdCreate(args) {
  const count = Number(args.count || 1);
  const ua =
    args.ua ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
  const { rawCall } = await openBrowser(args);

  const file = outFile(args);
  const accounts = await readSessions(file);
  let ok = 0;
  for (let i = 0; i < count; i++) {
    process.stdout.write(`[${i + 1}/${count}] provisioning xPrivo session… `);
    try {
      const { account } = await provisionAccount(rawCall, {
        userAgent: ua,
        onLog: () => {},
      });
      accounts.push(account);
      writeSessions(file, accounts);
      ok++;
      console.log("ok (" + account.sp_token.slice(0, 22) + "…)");
    } catch (e) {
      console.log("failed: " + e.message);
    }
  }
  console.log(`\nCreated ${ok}/${count}. Total sessions: ${accounts.length} -> ${file}`);
}

async function cmdList(args) {
  const file = outFile(args);
  const accounts = await readSessions(file);
  console.log(`Sessions in ${file}: ${accounts.length}`);
  for (const a of accounts) {
    console.log(`  ${a.id}  created=${a.createdAt || "?"}  token=${String(a.sp_token).slice(0, 22)}…`);
  }
}

async function cmdTest(args) {
  const file = outFile(args);
  const accounts = await readSessions(file);
  if (!accounts.length) throw new Error("no sessions; run `create` first");
  const model = args.model || "xprivo";
  const { rawCall } = await openBrowser(args);
  const { newContext } = require("./xprivo");
  let ok = 0;
  for (const a of accounts) {
    const ctx = await newContext(rawCall, { userAgent: a.ua });
    try {
      await ctx.session.call("Page.navigate", { url: "https://www.xprivo.com/" });
      await new Promise((r) => setTimeout(r, 2500));
      const out = await chatInContext(ctx, {
        model,
        messages: [{ role: "user", content: "Reply with exactly: XPRIVO_OK" }],
      });
      console.log(`  ${a.id}: ${JSON.stringify(out.content)} (model=${out.model})`);
      ok++;
    } catch (e) {
      console.log(`  ${a.id}: FAILED ${e.message}`);
    } finally {
      await ctx.dispose();
    }
  }
  console.log(`\n${ok}/${accounts.length} sessions answered.`);
}

async function cmdConnect(args) {
  process.env.ROUTER_URL = args.router || process.env.ROUTER_URL || "http://127.0.0.1:20128";
  if (args.password) process.env.ROUTER_PASSWORD = args.password;
  const { connect } = require("./connect-9router");
  await connect();
}

async function cmdServe(args) {
  if (args.out) process.env.XPRIVO_ACCOUNTS = outFile(args);
  if (args.port) process.env.PORT = String(args.port);
  if (args.cdp) process.env.CDP_URL = args.cdp;
  if (args.routing) process.env.XPRIVO_ROUTING = args.routing;
  const { makeServer } = require("./adapter");
  const { server, pool, cfg } = await makeServer();
  server.listen(cfg.port, cfg.host, () => {
    console.log(
      `xPrivo pool adapter on http://${cfg.host}:${cfg.port}  (${pool.healthyCount}/${pool.size} sessions, ${cfg.models.length} models)`
    );
  });
}

async function cmdModels() {
  console.log(`${MODEL_CATALOG.length} xPrivo models:`);
  for (const m of MODEL_CATALOG) console.log(`  ${m.id.padEnd(24)} ${m.premium ? "premium" : "free"}   ${m.name}`);
}

const COMMANDS = {
  create: cmdCreate,
  list: cmdList,
  test: cmdTest,
  connect: cmdConnect,
  serve: cmdServe,
  models: cmdModels,
};

function usage() {
  console.log(`xPrivo bulk session creator + 9Router connector

Usage: node src/cli.js <command> [options]

Commands:
  create    Provision N anonymous xPrivo sessions (isolated browser contexts)
  list      Show stored sessions
  test      Send a test message through every stored session
  serve     Run the OpenAI-compatible pool adapter
  connect   Register the adapter into 9Router
  models    Print the xPrivo model catalog

Common options:
  --count N            number of sessions to create (create)
  --out FILE           session store (default sessions.json)
  --cdp WS_URL         reuse an existing browser at this CDP endpoint
  --chrome PATH        path to Chromium/Chrome (default $CHROME_PATH or auto-detect)
  --proxy URL          proxy for the launched browser, e.g. http://host:port
  --headful            show the browser window
  --model ID           model for test (default xprivo)
  --port N             adapter port (serve, default 8791)
  --router URL         9Router base (connect, default http://127.0.0.1:20128)
  --password PW        9Router admin password (connect, default 123456)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (!cmd || !COMMANDS[cmd]) return usage();
  await COMMANDS[cmd](args);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  });
}

module.exports = { parseArgs };
