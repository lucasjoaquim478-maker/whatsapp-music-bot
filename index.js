import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!fs.existsSync(path.join(__dirname, "node_modules"))) {
  console.log("📦 node_modules não encontrado. Instalando dependências...");
  execSync("npm install", { cwd: __dirname, stdio: "inherit" });
  console.log("✅ Dependências instaladas!");
}

import("./bot.js");
