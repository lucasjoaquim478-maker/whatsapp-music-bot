import { createClient } from "./src/client.js";
import { searchMusic, downloadAudio, downloadVideo, cleanCache } from "./src/music.js";
import { startDashboard, emitLog, setStatus, setQR } from "./src/dashboard.js";
import pkg from "whatsapp-web.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { MessageMedia } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IGNORE = "🤖";
const IGNORED = ["558496321255@c.us", "558498321255@c.us"];

let opencodeKey = process.env.OPENCODE_KEY || "";
let groqKey = process.env.GROQ_KEY || "";
let geminiKey = process.env.GEMINI_KEY || "";
let dashPort = parseInt(process.env.PORT || process.env.DASH_PORT) || 3000;
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  if (!opencodeKey) opencodeKey = cfg.opencodeKey || "";
  if (!groqKey) groqKey = cfg.groqKey || "";
  if (!geminiKey) geminiKey = cfg.geminiKey || "";
  if (!process.env.DASH_PORT && !process.env.PORT && cfg.dashboardPort) dashPort = cfg.dashboardPort;
} catch (e) { console.error("config.json inválido ou não encontrado:", e.message); }

const origLog = console.log;
const origErr = console.error;
console.log = (...args) => { origLog(...args); emitLog("INFO", args.join(" ")); };
console.error = (...args) => { origErr(...args); emitLog("ERROR", args.join(" ")); };

const HELP = `🎵 *Comandos*
!play <música>    —  Baixa música em MP3
!video <nome>      —  Baixa vídeo em MP4
!ask <pergunta>    —  Responde com IA
!help              —  Mostra comandos

Adicione "${IGNORE}" no final para o bot ignorar o comando.`;

async function sendAudio(client, to, filePath, title) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".webm": "audio/webm", ".opus": "audio/ogg", ".wav": "audio/wav" };
  const mimetype = mimeMap[ext] || "audio/mpeg";
  const base64 = fs.readFileSync(filePath).toString("base64");
  const media = new MessageMedia(mimetype, base64, path.basename(filePath));
  await client.sendMessage(to, media, { caption: `🎵 ${title}` });
}

async function sendVideo(client, to, filePath, title) {
  const base64 = fs.readFileSync(filePath).toString("base64");
  const media = new MessageMedia("video/mp4", base64, path.basename(filePath));
  await client.sendMessage(to, media, { caption: `🎬 ${title}` });
}

async function askAI(question) {
  if (groqKey) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + groqKey },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: question }] }),
    });
    if (r.ok) { const d = await r.json(); return d?.choices?.[0]?.message?.content || "❌ Sem resposta."; }
    const errBody = await r.text().catch(() => "");
    return `❌ Erro Groq: ${r.status} ${errBody.slice(0, 200)}`;
  }
  if (opencodeKey) {
    const r = await fetch("https://opencode.ai/zen/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + opencodeKey },
      body: JSON.stringify({ model: "gpt-5-nano", messages: [{ role: "user", content: question }], max_tokens: 256 }),
    });
    if (r.ok) { const d = await r.json(); return d?.choices?.[0]?.message?.content || "❌ Sem resposta."; }
    const errBody = await r.text().catch(() => "");
    return `❌ Erro OpenCode: ${r.status} ${errBody.slice(0, 200)}`;
  }
  if (geminiKey) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: question }] }] }),
    });
    if (r.ok) { const d = await r.json(); return d?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Sem resposta."; }
    const errBody = await r.text().catch(() => "");
    return `❌ Erro Gemini: ${r.status} ${errBody.slice(0, 200)}`;
  }
  return "❌ Nenhuma API key configurada (coloca opencodeKey, groqKey ou geminiKey no config.json).";
}

async function handleMusic(client, msg, query) {
  try {
    await msg.reply(`🔍 Buscando: "${query}"...`);
    const videos = await searchMusic(query);
    if (!videos.length) return await msg.reply("❌ Nenhum resultado encontrado.");

    let lastErr = "";
    for (let i = 0; i < videos.length; i++) {
      await msg.reply(`🎵 (${i + 1}/${videos.length}) ${videos[i].title}\n📥 Baixando...`);

      try {
        const fp = await downloadAudio(videos[i].url);
        if (fp && fs.existsSync(fp) && fs.statSync(fp).size > 1000) {
          await sendAudio(client, msg.from, fp, videos[i].title);
          try { fs.unlinkSync(fp); } catch {}
          return;
        }
      } catch (e) {
        lastErr = (e && e.message ? e.message : String(e)).slice(0, 200);
        try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] tentativa ${i + 1} falhou: ${videos[i].url}: ${e.stack || e}\n`); } catch {}
        continue;
      }
    }

    await msg.reply(`❌ Nenhum áudio disponível. ${lastErr ? `Último erro: ${lastErr}` : ""}`);
  } catch (err) {
    const errMsg = (err && err.message ? err.message : String(err)).slice(0, 200);
    try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] ${err.stack || err}\n`); } catch {}
    try { await msg.reply(`❌ Erro: ${errMsg}`); } catch {}
  }
}

async function handleVideo(client, msg, query) {
  try {
    await msg.reply(`🔍 Buscando: "${query}"...`);
    const videos = await searchMusic(query);
    if (!videos.length) return await msg.reply("❌ Nenhum resultado encontrado.");

    let lastErr = "";
    for (let i = 0; i < videos.length; i++) {
      await msg.reply(`🎬 (${i + 1}/${videos.length}) ${videos[i].title}\n📥 Baixando...`);

      let fp = null;
      try {
        fp = await downloadVideo(videos[i].url);
      } catch (e) {
        lastErr = (e && e.message ? e.message : String(e)).slice(0, 200);
        try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] tentativa ${i + 1} falhou: ${videos[i].url}: ${e.stack || e}\n`); } catch {}
        continue;
      }
      if (!fp || !fs.existsSync(fp) || fs.statSync(fp).size <= 1000) { continue; }

      try {
        await sendVideo(client, msg.from, fp, videos[i].title);
        try { fs.unlinkSync(fp); } catch {}
        return;
      } catch {
        try { fs.unlinkSync(fp); } catch {}
        lastErr = "Vídeo muito grande para enviar";
        continue;
      }
    }

    await msg.reply(`❌ Nenhum vídeo disponível. ${lastErr ? `Último erro: ${lastErr}` : ""}`);
  } catch (err) {
    const errMsg = (err && err.message ? err.message : String(err)).slice(0, 200);
    try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] ${err.stack || err}\n`); } catch {}
    try { await msg.reply(`❌ Erro: ${errMsg}`); } catch {}
  }
}

const handler = async (client, msg, text) => {
  if (text.includes(IGNORE)) return;
  if (IGNORED.includes(msg.from)) return;

  const t = text.toLowerCase().trim();
  const sender = msg.from.replace("@c.us", "");

  if (!t.startsWith("!")) return;

  emitLog("COMMAND", `${sender}: ${text.slice(0, 80)}`);

  // !help / !comandos / !ajuda
  if (t === "!help" || t === "!comandos" || t === "!ajuda") {
    return await msg.reply(HELP);
  }

  // !play <query> / !tocar / !baixar / !musica
  const musicPrefixes = { "!play ": 6, "!tocar ": 7, "!baixar ": 8, "!musica ": 8 };
  for (const [pref, len] of Object.entries(musicPrefixes)) {
    if (t.startsWith(pref)) {
      const q = text.slice(len).trim();
      if (!q) return;
      return await handleMusic(client, msg, q);
    }
  }

  // !video <query> / !vídeo <query>
  if (t.startsWith("!video ") || t.startsWith("!vídeo ")) {
    const prefixLen = t.startsWith("!video ") ? 7 : 8;
    const q = text.slice(prefixLen).trim();
    if (!q) return;
    return await handleVideo(client, msg, q);
  }

  // !ask <query> / !pergunta <query>
  if (t.startsWith("!ask ") || t.startsWith("!pergunta ")) {
    const prefixLen = t.startsWith("!ask ") ? 5 : 10;
    const q = text.slice(prefixLen).trim();
    if (!q) return;
    await msg.reply("💭 Pensando...");
    const answer = await askAI(q);
    await msg.reply(answer);
    return;
  }
};

process.on("uncaughtException", (err) => {
  try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] FATAL: ${err.stack}\n`); } catch {}
});

process.on("SIGINT", () => { cleanCache(); process.exit(); });

startDashboard(dashPort);
emitLog("SYSTEM", "Iniciando bot...");
console.log("Iniciando bot...");
createClient(handler, { setStatus, setQR });
