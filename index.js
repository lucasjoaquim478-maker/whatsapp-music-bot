import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

function checkModules() {
  try { req.resolve("whatsapp-web.js"); return true; } catch { return false; }
}

if (!checkModules()) {
  console.log("📦 Dependências não encontradas. Instalando...");
  try {
    execSync("npm install --no-audit --no-fund", { cwd: __dirname, stdio: "inherit", timeout: 300000 });
  } catch {
    console.log("⚠️ Tentando sem scripts de pós-instalação...");
    try {
      execSync("npm install --no-audit --no-fund --ignore-scripts", { cwd: __dirname, stdio: "inherit", timeout: 300000 });
    } catch (e2) {
      console.error("❌ Falha ao instalar. Execute manualmente: cd /d \"" + __dirname + "\" && npm install");
      process.exit(1);
    }
  }
  if (!checkModules()) {
    console.error("❌ Ainda faltam módulos. Execute: npm install");
    process.exit(1);
  }
  console.log("✅ Dependências instaladas!");
}

import("./bot.js").catch(err => {
  console.error("Falha ao carregar bot.js:", err);
  process.exit(1);
});
