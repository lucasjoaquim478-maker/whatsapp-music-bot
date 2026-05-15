import { createClient } from "./src/client.js";
import { searchMusic, downloadAudio, cleanCache } from "./src/music.js";
import pkg from "whatsapp-web.js";
import fs from "fs";
import path from "path";

const { MessageMedia } = pkg;
const PREFIX = "!";
const HELP = `🎵 *Comandos*
${PREFIX}play <música>  —  Baixa e envia em MP3
${PREFIX}help           —  Mostra comandos`;

function parse(text) {
  const t = text.toLowerCase().trim();
  for (const c of [`${PREFIX}play `, `${PREFIX}tocar `, `${PREFIX}baixar `, `${PREFIX}musica `]) {
    if (t.startsWith(c)) return { type: "music", q: text.slice(c.length).trim() };
  }
  if ([`${PREFIX}help`, `${PREFIX}comandos`, `${PREFIX}ajuda`].some(c => t === c)) return { type: "help" };
  if (t.startsWith(PREFIX)) return { type: "unknown" };
  return { type: "music", q: text };
}

async function sendAudio(client, to, filePath, title) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".webm": "audio/webm", ".opus": "audio/ogg", ".wav": "audio/wav" };
  const mimetype = mimeMap[ext] || "audio/mpeg";
  const base64 = fs.readFileSync(filePath).toString("base64");
  const media = new MessageMedia(mimetype, base64, path.basename(filePath));
  await client.sendMessage(to, media, { caption: `🎵 ${title}` });
}

const handler = async (client, msg, text) => {
  const cmd = parse(text);

  if (cmd.type === "help") return await msg.reply(HELP);
  if (cmd.type === "unknown") return await msg.reply(`Use ${PREFIX}help para comandos.`);

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
};

process.on("uncaughtException", (err) => {
  try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] FATAL: ${err.stack}\n`); } catch {}
});

process.on("SIGINT", () => { cleanCache(); process.exit(); });

console.log("Iniciando bot...");
const client = createClient(handler);
client.initialize();
