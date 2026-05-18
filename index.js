process.on("uncaughtException", (e) => { console.error("[UNCAUGHT]", e?.stack || e); });
process.on("unhandledRejection", (e) => { console.error("[UNHANDLED]", e?.stack || e); });

import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createRequire } from "module";

console.log("[INDEX] Node", process.version, "PID:", process.pid);
console.log("[INDEX] CWD:", process.cwd());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

const server = http.createServer((q, r) => r.end("BOT_STARTING"));
server.listen(3000, () => console.log("[INDEX] HTTP on 3000"));
global.__HTTP_SERVER = server;

function checkModules() {
  try { req.resolve("whatsapp-web.js"); return true; } catch { return false; }
}

if (!checkModules()) {
  console.log("[INDEX] npm install...");
  try { execSync("npm install --no-audit --no-fund --ignore-scripts", { cwd: __dirname, stdio: "inherit", timeout: 300000 }); } catch (e) { console.error("[INDEX] npm install failed:", e.message); }
  if (!checkModules()) { console.error("[INDEX] Modules still missing"); }
}

console.log("[INDEX] Loading bot.js...");
import("./bot.js").catch(err => {
  console.error("[INDEX] bot.js failed:", err?.stack || err);
});
