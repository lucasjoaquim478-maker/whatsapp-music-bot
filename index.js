process.on("uncaughtException", (e) => { console.error("[UNCAUGHT]", e?.stack || e); });
process.on("unhandledRejection", (e) => { console.error("[UNHANDLED]", e?.stack || e); });

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createRequire } from "module";

console.log("[INDEX] Node", process.version, process.platform, process.arch, "PID:", process.pid);
console.log("[INDEX] CWD:", process.cwd());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

function checkModules() {
  try { req.resolve("whatsapp-web.js"); return true; } catch { return false; }
}

if (!checkModules()) {
  console.log("[INDEX] npm install...");
  try { execSync("npm install --no-audit --no-fund --ignore-scripts", { cwd: __dirname, stdio: "inherit", timeout: 300000 }); } catch (e) { console.error("[INDEX] npm install failed:", e.message); process.exit(1); }
  if (!checkModules()) { console.error("[INDEX] Modules still missing"); process.exit(1); }
}

console.log("[INDEX] Loading bot.js...");
import("./bot.js").catch(err => {
  console.error("[INDEX] Falha ao carregar bot.js:", err?.stack || err);
  process.exit(1);
});

// Keep ESM test server as fallback health check
import http from "http";
http.createServer((q, r) => r.end("BOT_LOADING")).listen(3000, () => {});
