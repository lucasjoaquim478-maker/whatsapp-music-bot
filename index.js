import { config } from "./src/config.js";
import { createClient } from "./src/client.js";
import { searchMusic, downloadAudio, cleanCache } from "./src/music.js";
import fs from "fs";
import path from "path";

const lockFile = path.join(process.cwd(), ".bot.lock");
if (fs.existsSync(lockFile)) {
  console.log("Bot já está rodando. Fechando esta instância.");
  process.exit(0);
}
fs.writeFileSync(lockFile, String(process.pid));

function cleanup() {
  try { fs.unlinkSync(lockFile); } catch {}
  cleanCache();
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(); });
process.on("uncaughtException", (err) => {
  const log = `[${new Date().toISOString()}] ${err.stack || err.message}\n`;
  fs.appendFileSync("erro.log", log);
  console.error("Erro não tratado. Detalhes salvos em erro.log");
  cleanup();
});

const PREFIX = config.prefix || "!";

const HELP_TEXT = `🎵 *Comandos do Bot*

${PREFIX}play <música>   —  Busca e envia a música
${PREFIX}tocar <música>  —  Busca e envia a música
${PREFIX}help            —  Mostra esta mensagem
${PREFIX}comandos        —  Mostra esta mensagem

Envie qualquer mensagem começando com "${PREFIX}" seguido do comando.`;

const client = createClient();

function parseCommand(text) {
  const lower = text.toLowerCase().trim();
  for (const cmd of [`${PREFIX}play `, `${PREFIX}tocar `, `${PREFIX}baixar `, `${PREFIX}musica `, `${PREFIX}search `]) {
    if (lower.startsWith(cmd)) {
      return { type: "music", query: text.slice(cmd.length).trim() };
    }
  }
  const cmdOnly = [`${PREFIX}help`, `${PREFIX}comandos`, `${PREFIX}ajuda`];
  if (cmdOnly.some(c => lower === c || lower.startsWith(c + " "))) {
    return { type: "help" };
  }
  if (lower.startsWith(PREFIX)) {
    return { type: "unknown", message: `Comando não reconhecido. Use ${PREFIX}help para ver os comandos.` };
  }
  return null;
}

const musicFlow = async (msg, chat, query) => {
  try {
    await msg.reply(`🔍 Buscando: "${query}"...`);
    const videos = await searchMusic(query);
    if (!videos.length) {
      await msg.reply("❌ Nenhum resultado encontrado.");
      return;
    }
    await msg.reply(`🎵 ${videos[0].title}\n⏱ ${Math.floor(videos[0].duration / 60)}:${String(videos[0].duration % 60).padStart(2, "0")}\n📥 Baixando áudio...`);

    let lastErr = null;
    for (const video of videos) {
      try {
        const filePath = await downloadAudio(video.url);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 1000) continue;
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, fs.readFileSync(filePath), {
          sendMediaAsDocument: true,
          fileName: path.basename(filePath),
          caption: `🎵 ${video.title}`,
        });
        try { fs.unlinkSync(filePath); } catch {}
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Nenhum vídeo disponível.");
  } catch (err) {
    const m = err.message || "Erro desconhecido";
    try { fs.appendFileSync("erro.log", `[${new Date().toISOString()}] ${err.stack || err.message}\n`); } catch {}
    await msg.reply(`❌ ${m}`);
  }
};

client.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us")) return;
  if (msg.fromMe) return;

  const chat = await msg.getChat();
  const text = msg.body?.trim();
  if (!text || !text.startsWith(PREFIX)) return;

  const cmd = parseCommand(text);
  if (!cmd) return;

  if (cmd.type === "help") {
    await msg.reply(HELP_TEXT);
    return;
  }
  if (cmd.type === "music" && cmd.query) {
    await chat.sendStateTyping();
    await musicFlow(msg, chat, cmd.query);
    return;
  }
  if (cmd.type === "unknown") {
    await msg.reply(cmd.message);
    return;
  }
});

console.log("Iniciando bot...");
client.initialize();
