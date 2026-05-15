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
  console.error("Erro não tratado:", err.message);
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
    const video = await searchMusic(query);
    await msg.reply(`🎵 ${video.title}\n⏱ ${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, "0")}\n📥 Baixando áudio...`);
    const filePath = await downloadAudio(video.url);
    await chat.sendStateTyping();
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      await client.sendMessage(msg.from, fs.readFileSync(filePath), {
        sendMediaAsDocument: true,
        fileName: path.basename(filePath),
        caption: `🎵 ${video.title}`,
      });
      try { fs.unlinkSync(filePath); } catch {}
    } else {
      await msg.reply("❌ Erro ao processar o áudio. Tente outra música.");
    }
  } catch (err) {
    const m = err.message || "Erro desconhecido";
    if (m.includes("e.replace")) {
      await msg.reply("❌ Erro interno. Já estou corrigindo, tente de novo em alguns minutos.");
      console.error("Stack:", err.stack);
      return;
    }
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
