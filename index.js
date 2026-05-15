import { createClient } from "./src/client.js";
import { searchMusic, downloadAudio, cleanCache } from "./src/music.js";
import fs from "fs";
import path from "path";

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
  const MAX_RETRIES = 2;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      const buf = fs.readFileSync(filePath);
      await client.sendMessage(to, buf, {
        sendMediaAsDocument: false,
        type: "audio",
        caption: `🎵 ${title}`,
      });
      return true;
    } catch (e1) {
      try {
        const buf = fs.readFileSync(filePath);
        await client.sendMessage(to, buf, {
          sendMediaAsDocument: true,
          fileName: path.basename(filePath),
          caption: `🎵 ${title}`,
        });
        return true;
      } catch (e2) {
        if (i === MAX_RETRIES) throw e2;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  return false;
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
      if (!videos.length) return await msg.reply("❌ Nenhum resultado.");

      const chat = await msg.getChat();
      await msg.reply(`🎵 ${videos[0].title}\n📥 Baixando...`);

      let lastErr = null;
      for (const v of videos) {
        try {
          const fp = await downloadAudio(v.url);
          if (!fs.existsSync(fp) || fs.statSync(fp).size <= 1000) continue;

          await chat.sendStateTyping();
          const ok = await sendAudio(client, msg.from, fp, v.title);
          try { fs.unlinkSync(fp); } catch {}

          if (ok) {
            try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] OK: ${v.title}\n`); } catch {}
            return;
          }
        } catch (e) {
          lastErr = e;
          try { fs.appendFileSync("log.txt", `[${new Date().toISOString()}] ERRO: ${e.message}\n`); } catch {}
        }
      }
      throw lastErr || new Error("Não foi possível baixar.");
    } catch (err) {
      await msg.reply(`❌ ${err.message || "Erro"}`);
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
