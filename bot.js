import { createClient } from "./src/client.js";
import { searchMusic, downloadAudio, downloadVideo, cleanCache } from "./src/music.js";
import pkg from "whatsapp-web.js";
import fs from "fs";
import path from "path";

const { MessageMedia } = pkg;
const PREFIX = "!";
const IGNORE = "🤖";
const IGNORED = ["558496321255@c.us"];

let geminiKey = "";
try {
  const cfg = JSON.parse(fs.readFileSync("./config.json", "utf8"));
  geminiKey = cfg.geminiKey || "";
} catch {}

const HELP = `🎵 *Comandos*
${PREFIX}play <música>    —  Baixa música em MP3
${PREFIX}video <nome>      —  Baixa vídeo em MP4
${PREFIX}ask <pergunta>    —  Responde com IA (Gemini)
${PREFIX}help              —  Mostra comandos

Adicione "${IGNORE}" no final para o bot ignorar o comando.`;

function parse(text) {
  const t = text.toLowerCase().trim();
  for (const c of [`${PREFIX}play `, `${PREFIX}tocar `, `${PREFIX}baixar `, `${PREFIX}musica `]) {
    if (t.startsWith(c)) return { type: "music", q: text.slice(c.length).trim() };
  }
  if ([`${PREFIX}help`, `${PREFIX}comandos`, `${PREFIX}ajuda`].some(c => t === c)) return { type: "help" };
  for (const c of [`${PREFIX}ask `, `${PREFIX}pergunta `]) {
    if (t.startsWith(c)) return { type: "ask", q: text.slice(c.length).trim() };
  }
  if (t === `${PREFIX}ask` || t === `${PREFIX}pergunta`) return { type: "ask", q: "" };
  for (const c of [`${PREFIX}video `, `${PREFIX}video`]) {
    if (t.startsWith(c)) return { type: "video", q: text.slice(c.length).trim() };
  }
  return null;
}

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

const handler = async (client, msg, text) => {
  if (text.includes(IGNORE)) return;
  if (IGNORED.includes(msg.from)) return;
  if (!text.startsWith(PREFIX)) return;
  const cmd = parse(text);
  if (!cmd) return;

  if (cmd.type === "help") return await msg.reply(HELP);

  if (cmd.type === "ask" && cmd.q) {
    await msg.reply(`💭 Pensando...`);
    const answer = await askGemini(cmd.q);
    await msg.reply(answer);
    return;
  }

  if (cmd.type === "music" && cmd.q) {
    try {
      await msg.reply(`🔍 Buscando: "${cmd.q}"...`);
      const videos = await searchMusic(cmd.q);
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

  if (cmd.type === "video" && cmd.q) {
    try {
      await msg.reply(`🔍 Buscando: "${cmd.q}"...`);
      const videos = await searchMusic(cmd.q);
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
};

process.on("uncaughtException", (err) => {
  try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] FATAL: ${err.stack}\n`); } catch {}
});

process.on("SIGINT", () => { cleanCache(); process.exit(); });

console.log("Iniciando bot...");
const client = createClient(handler);
client.initialize();
