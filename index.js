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
  return null;
}

async function sendAudio(client, to, filePath, title) {
  const media = MessageMedia.fromFilePath(filePath);
  await client.sendMessage(to, media, { caption: `🎵 ${title}` });
}

const handler = async (client, msg, text) => {
  const cmd = parse(text);
  if (!cmd) return;

  if (cmd.type === "help") return await msg.reply(HELP);
  if (cmd.type === "unknown") return await msg.reply(`Use ${PREFIX}help para comandos.`);

  if (cmd.type === "music" && cmd.q) {
    try {
      await msg.reply(`🔍 Buscando: "${cmd.q}"...`);
      const videos = await searchMusic(cmd.q);
      if (!videos.length) return await msg.reply("❌ Nenhum resultado encontrado.");

      const chat = await msg.getChat();
      await msg.reply(`🎵 ${videos[0].title}\n📥 Baixando...`);

      let lastErr = null;
      for (const v of videos) {
        try {
          const fp = await downloadAudio(v.url);
          if (!fs.existsSync(fp) || fs.statSync(fp).size <= 1000) {
            lastErr = new Error("Arquivo vazio ou não encontrado");
            continue;
          }
          await chat.sendStateTyping();
          await sendAudio(client, msg.from, fp, v.title);
          try { fs.unlinkSync(fp); } catch {}
          return;
        } catch (e) {
          lastErr = e;
          const log = `[${new Date().toISOString()}] VIDEO ${v.title}: ${e.stack || e.message || e}\n`;
          try { fs.appendFileSync("log.txt", log); } catch {}
        }
      }
      throw lastErr || new Error("Não foi possível baixar.");
    } catch (err) {
      const log = `[${new Date().toISOString()}] FINAL: ${err.stack || err.message || err}\n`;
      try { fs.appendFileSync("log.txt", log); } catch {}
      await msg.reply(`❌ ${err && err.message ? err.message : "Erro desconhecido (ver log.txt)"}`);
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
