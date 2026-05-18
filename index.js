process.on("uncaughtException", (e) => { console.error("UNCAUGHT:", e?.stack || e); });
process.on("unhandledRejection", (e) => { console.error("UNHANDLED:", e?.stack || e); });
console.log("[INDEX] Node", process.version, process.platform, process.arch, "PID:", process.pid);
console.log("[INDEX] CWD:", process.cwd(), "ARGS:", process.argv.slice(1).join(" "));
console.log("[INDEX] PATH:", process.env.PATH ? "ok" : "missing");
console.log("[INDEX] CHROMIUM_PATH:", process.env.CHROMIUM_PATH || "(not set)");

try {
  const fs = await import("fs");
  const path = await import("path");
  const { execSync } = await import("child_process");
  const { createRequire } = await import("module");
  const { fileURLToPath } = await import("url");

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const req = createRequire(import.meta.url);

  console.log("[INDEX] Modules loaded, checking deps...");
  let modulesOk = false;
  try { req.resolve("whatsapp-web.js"); modulesOk = true; } catch { modulesOk = false; }

  if (!modulesOk) {
    console.log("[INDEX] npm install...");
    try { execSync("npm install --no-audit --no-fund --ignore-scripts", { cwd: __dirname, stdio: "inherit", timeout: 300000 }); } catch (e) { console.error("[INDEX] npm install failed:", e.message); }
    try { req.resolve("whatsapp-web.js"); modulesOk = true; } catch { modulesOk = false; }
    if (!modulesOk) { console.error("[INDEX] Modules still missing"); process.exit(1); }
  }

  console.log("[INDEX] Loading bot.js...");
  const bot = await import("./bot.js");
  console.log("[INDEX] bot.js loaded successfully");
} catch (err) {
  console.error("[INDEX] FATAL:", err?.stack || err);
  process.exit(1);
}
