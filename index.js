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

async function sendText(sock, jid, text, quoted) {
  await sock.sendMessage(jid, { text }, { quoted });
}

async function reply(sock, msg, text) {
  await sendText(sock, msg.key.remoteJid, text, msg);
}

async function musicFlow(sock, msg, query) {
  try {
    await reply(sock, msg, `🔍 Buscando: "${query}"...`);
    const videos = await searchMusic(query);
    if (!videos.length) return await reply(sock, msg, "❌ Nenhum resultado encontrado.");

    await reply(sock, msg, `🎵 ${videos[0].title}\n📥 Baixando...`);

    let lastErr = null;
    for (const v of videos) {
      try {
        const fp = await downloadAudio(v.url);
        if (!fs.existsSync(fp) || fs.statSync(fp).size <= 1000) continue;
        const buf = fs.readFileSync(fp);
        await sock.sendMessage(msg.key.remoteJid, {
          audio: buf,
          mimetype: "audio/mpeg",
          fileName: path.basename(fp),
        }, { quoted: msg });
        try { fs.unlinkSync(fp); } catch {}
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Nenhum disponível.");
  } catch (err) {
    await reply(sock, msg, `❌ ${err.message || "Erro"}`);
    try { fs.appendFileSync("erro.log", `[${new Date().toISOString()}] ${err.stack}\n`); } catch {}
  }
}

const handler = async (sock, msg, text) => {
  const cmd = parse(text);
  if (!cmd) return;

  if (cmd.type === "help") return await reply(sock, msg, HELP);
  if (cmd.type === "unknown") return await reply(sock, msg, `Use ${PREFIX}help para comandos.`);
  if (cmd.type === "music" && cmd.q) return await musicFlow(sock, msg, cmd.q);
};

process.on("uncaughtException", (err) => {
  try { fs.appendFileSync("erro.log", `[${new Date().toISOString()}] UNCAUGHT: ${err.stack}\n`); } catch {}
});

process.on("SIGINT", () => { cleanCache(); process.exit(); });

console.log("Iniciando bot...");
createClient(handler);
