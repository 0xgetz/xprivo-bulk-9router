"use strict";
// Launch (or reuse) a local Chromium/Chrome and expose its CDP WebSocket URL.
//
// Open-source friendly and zero npm dependencies: point it at any Chromium/Chrome
// binary with CHROME_PATH, or let it auto-detect common locations. It starts a
// dedicated headless instance on a private debug port, so it never touches the
// user's everyday browser profile.
//
// Resolution order for an already-running endpoint: opts.cdpUrl -> CDP_URL env.
// Otherwise (or when none is set) a local browser is launched.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/opt/chrome/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
].filter(Boolean);

function findChrome() {
  for (const c of CANDIDATES) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function waitForVersion(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Chromium did not expose a debug port in time");
}

// Returns { wsUrl, proc, port, profileDir, close() }.
async function launch({ port = 0, headless = true, chromePath, proxy, extraArgs = [] } = {}) {
  const bin = chromePath || findChrome();
  if (!bin) throw new Error("No Chromium/Chrome found. Set CHROME_PATH to your browser binary.");

  const realPort = port || 9000 + Math.floor(Math.random() * 900);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "xprivo-bulk-chrome-"));
  const args = [
    headless ? "--headless=new" : "--start-maximized",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${realPort}`,
    `--user-data-dir=${profileDir}`,
    ...(proxy ? [`--proxy-server=${proxy}`] : []),
    ...extraArgs,
    "about:blank",
  ];
  const proc = spawn(bin, args, { stdio: "ignore", detached: false });
  proc.on("error", () => {});
  const info = await waitForVersion(realPort);
  const wsUrl = info.webSocketDebuggerUrl;

  return {
    wsUrl,
    proc,
    port: realPort,
    profileDir,
    bin,
    close() {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

// Resolve a CDP endpoint: reuse opts.cdpUrl/CDP_URL, else launch a local browser.
async function resolveCdp({ cdpUrl, chromePath, proxy, headless = true, onLog = () => {} } = {}) {
  const existing = cdpUrl || process.env.CDP_URL;
  if (existing) {
    onLog("using existing CDP endpoint");
    return { wsUrl: existing, launched: null };
  }
  const bin = chromePath || findChrome();
  if (!bin) {
    throw new Error("No local Chromium found. Install Chromium/Chrome or set CHROME_PATH.");
  }
  const proxyServer = proxy || process.env.XPRIVO_PROXY || "";
  onLog("launching local Chromium: " + bin + (proxyServer ? " via proxy " + proxyServer : ""));
  const launched = await launch({ chromePath: bin, headless, proxy: proxyServer });
  onLog("Chromium ready on port " + launched.port);
  return { wsUrl: launched.wsUrl, launched };
}

module.exports = { launch, resolveCdp, findChrome };
