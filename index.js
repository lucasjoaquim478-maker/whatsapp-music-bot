import { config } from "./src/config.js";
import { createClient } from "./src/client.js";
import { interpretMessage } from "./src/ai.js";
import { searchMusic, downloadAudio, cleanCache } from "./src/music.js";
import fs from "fs";

const userStates = new Map();

function getUserState(from) {
  if (!userStates.has(from)) userStates.set(from, {});
  return userStates.get(from);
}

const client = createClient();

client.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us")) return;
  if (msg.fromMe) return;

  const chat = await msg.getChat();
  const state = getUserState(msg.from);
  const text = msg.body?.trim();

  if (!text) {
    await chat.sendStateTyping();
    await msg.reply("Envie o nome de uma música que eu busco pra você!");
    return;
  }

  await chat.sendStateTyping();
  const interpreted = await interpretMessage(text);

  if (interpreted.type === "help") {
    await msg.reply(interpreted.message || "Envie o nome de uma música que eu procuro!");
    return;
  }

  if (interpreted.type === "unknown") {
    await msg.reply(interpreted.message || "Só sei buscar músicas! Diga algo como: 'quero ouvir [música]'");
    return;
  }

  if (interpreted.type === "music" && interpreted.query) {
    try {
      await msg.reply(`🔍 Buscando: "${interpreted.query}"...`);
      const video = await searchMusic(interpreted.query);

      await msg.reply(`🎵 ${video.title}\n⏱ ${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, "0")}\n📥 Baixando áudio...`);

      const filePath = await downloadAudio(video.url);
      const fileName = filePath.split(/[\\/]/).pop();

      await chat.sendStateTyping();

      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        await client.sendMessage(msg.from, fs.readFileSync(filePath), {
          sendMediaAsDocument: true,
          fileName: fileName,
          caption: `🎵 ${video.title}`,
        });
        fs.unlinkSync(filePath);
      } else {
        await msg.reply("❌ Erro ao processar o áudio. Tente outra música.");
      }
    } catch (err) {
      const message = err.message.includes("muito longa")
        ? `❌ ${err.message}`
        : "❌ Não encontrei essa música. Tente com outro nome.";
      await msg.reply(message);
    }
    return;
  }

  await msg.reply("Envie o nome de uma música que eu procuro!");
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
