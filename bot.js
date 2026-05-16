import { createClient } from "./src/client.js";
import { searchMusic, downloadAudio, downloadVideo, cleanCache } from "./src/music.js";
import pkg from "whatsapp-web.js";
import fs from "fs";
import path from "path";

const { MessageMedia } = pkg;
const IGNORE = "🤖";
const IGNORED = ["558496321255@c.us", "558498321255@c.us"];

let geminiKey = "";
try {
  const cfg = JSON.parse(fs.readFileSync("./config.json", "utf8"));
  geminiKey = cfg.geminiKey || "";
} catch {}

const HELP = `🎵 *Comandos*
!play <música>    —  Baixa música em MP3
!video <nome>      —  Baixa vídeo em MP4
!ask <pergunta>    —  Responde com IA (Gemini)
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

async function askGemini(question) {
  if (!geminiKey) return "❌ Gemini key não configurada (config.json).";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: question }] }] }),
  });
  if (!r.ok) return `❌ Erro API: ${r.status}`;
  const data = await r.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return txt || "❌ Sem resposta.";
}

async function handleMusic(client, msg, query) {
  try {
    await msg.reply(`🔍 Buscando: "${query}"...`);
    const videos = await searchMusic(query);
    if (!videos.length) return await msg.reply("❌ Nenhum resultado encontrado.");

    await msg.reply(`🎵 ${videos[0].title}\n📥 Baixando...`);

    let sent = false;
    for (const v of videos) {
      try {
        const fp = await downloadAudio(v.url);
        if (!fs.existsSync(fp) || fs.statSync(fp).size <= 1000) continue;

        try {
          await sendAudio(client, msg.from, fp, v.title);
          sent = true;
        } catch {
          const buf = fs.readFileSync(fp);
          await client.sendMessage(msg.from, buf, { caption: `🎵 ${v.title}` });
          sent = true;
        }

        try { fs.unlinkSync(fp); } catch {}
        if (sent) return;
      } catch (e) {
        try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] ${v.title}: ${e.stack || e}\n`); } catch {}
      }
    }

    await msg.reply(`❌ Não consegui enviar o áudio. Link: ${videos[0].url}`);
  } catch (err) {
    try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] ${err.stack || err}\n`); } catch {}
    await msg.reply(`❌ Erro. Detalhes salvos em log.txt`);
  }
}

async function handleVideo(client, msg, query) {
  try {
    await msg.reply(`🔍 Buscando: "${query}"...`);
    const videos = await searchMusic(query);
    if (!videos.length) return await msg.reply("❌ Nenhum resultado encontrado.");

    await msg.reply(`🎬 ${videos[0].title}\n📥 Baixando vídeo...`);

    const fp = await downloadVideo(videos[0].url);
    if (!fs.existsSync(fp) || fs.statSync(fp).size <= 1000)
      return await msg.reply("❌ Vídeo muito grande ou erro no download.");

    try {
      await sendVideo(client, msg.from, fp, videos[0].title);
    } catch {
      await msg.reply(`❌ Vídeo muito grande para enviar. Link: ${videos[0].url}`);
    }

    try { fs.unlinkSync(fp); } catch {}
  } catch (err) {
    try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] ${err.stack || err}\n`); } catch {}
    await msg.reply(`❌ Erro. Detalhes salvos em log.txt`);
  }
}

const handler = async (client, msg, text) => {
  if (text.includes(IGNORE)) return;
  if (IGNORED.includes(msg.from)) return;

  const t = text.toLowerCase().trim();

  if (!t.startsWith("!")) return;

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

  // !video <query>
  if (t.startsWith("!video ")) {
    const q = text.slice(7).trim();
    if (!q) return;
    return await handleVideo(client, msg, q);
  }

  // !ask <query> / !pergunta <query>
  if (t.startsWith("!ask ") || t.startsWith("!pergunta ")) {
    const prefixLen = t.startsWith("!ask ") ? 5 : 10;
    const q = text.slice(prefixLen).trim();
    if (!q) return;
    await msg.reply("💭 Pensando...");
    const answer = await askGemini(q);
    await msg.reply(answer);
    return;
  }
};

process.on("uncaughtException", (err) => {
  try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] FATAL: ${err.stack}\n`); } catch {}
});

process.on("SIGINT", () => { cleanCache(); process.exit(); });

console.log("Iniciando bot...");
const client = createClient(handler);
client.initialize();
