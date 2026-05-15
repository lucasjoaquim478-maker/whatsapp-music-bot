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
process.on("exit", () => { try { fs.unlinkSync(lockFile); } catch {} });
process.on("SIGINT", () => { try { fs.unlinkSync(lockFile); } catch {}; cleanCache(); process.exit(); });
process.on("uncaughtException", (err) => {
  console.error("Erro não tratado:", err.message);
  try { fs.unlinkSync(lockFile); } catch {}
});

const PREFIX = config.prefix || "!";

const HELP_TEXT = `🎵 *Comandos do Bot*

${PREFIX}play <música>   —  Busca e envia a música
${PREFIX}tocar <música>  —  Busca e envia a música
${PREFIX}help            —  Mostra esta mensagem
${PREFIX}comandos        —  Mostra esta mensagem

Envie qualquer mensagem começando com "${PREFIX}" seguido do comando.`;

const userStates = new Map();

function getUserState(from) {
  if (!userStates.has(from)) userStates.set(from, {});
  return userStates.get(from);
}

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
    const video = await searchMusic(query);
    await msg.reply(`🎵 ${video.title}\n⏱ ${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, "0")}\n📥 Baixando áudio...`);
    const filePath = await downloadAudio(video.url);
    await chat.sendStateTyping();
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      await client.sendMessage(msg.from, fs.readFileSync(filePath), {
        sendMediaAsDocument: true,
        fileName: filePath.split(/[\\/]/).pop(),
        caption: `🎵 ${video.title}`,
      });
      fs.unlinkSync(filePath);
    } else {
      await msg.reply("❌ Erro ao processar o áudio. Tente outra música.");
    }
  } catch (err) {
    const msg2 = err.message.includes("muito longa")
      ? `❌ ${err.message}`
      : `❌ Erro ao baixar: ${err.message}`;
    await msg.reply(msg2);
  }
};

client.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us")) return;
  if (msg.fromMe) return;

  const chat = await msg.getChat();
  const text = msg.body?.trim();

  if (!text || !text.startsWith(PREFIX)) return;

  const cmd = parseCommand(text);

  if (cmd?.type === "help") {
    await msg.reply(HELP_TEXT);
    return;
  }

  if (cmd?.type === "music" && cmd.query) {
    await chat.sendStateTyping();
    await musicFlow(msg, chat, cmd.query);
    return;
  }

  if (cmd?.type === "unknown") {
    await msg.reply(cmd.message);
    return;
  }
});

process.on("SIGINT", () => {
  cleanCache();
  process.exit();
});

process.on("uncaughtException", (err) => {
  console.error("Erro não tratado:", err.message);
});

console.log("Iniciando bot...");
client.initialize();
