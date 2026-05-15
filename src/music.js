import ytdl from "@distube/ytdl-core";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

export async function searchMusic(query) {
  const result = await ytSearch(query);
  const video = result.videos?.[0];
  if (!video) throw new Error("Nenhum resultado encontrado.");
  if ((video.seconds || 0) > config.maxDuration) {
    throw new Error(`Música muito longa (máx ${config.maxDuration}s).`);
  }
  return { title: video.title, url: video.url, duration: video.seconds, thumbnail: video.thumbnail };
}

export async function downloadAudio(videoUrl) {
  if (!fs.existsSync(config.cacheDir)) {
    fs.mkdirSync(config.cacheDir, { recursive: true });
  }

  const filePath = path.join(config.cacheDir, `audio_${Date.now()}.mp3`);

  return new Promise((resolve, reject) => {
    const stream = ytdl(videoUrl, {
      filter: "audioonly",
      quality: "lowestaudio",
    }).pipe(fs.createWriteStream(filePath));

    stream.on("finish", () => {
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        resolve(filePath);
      } else {
        try { fs.unlinkSync(filePath); } catch {}
        reject(new Error("Arquivo vazio"));
      }
    });
    stream.on("error", (e) => {
      try { fs.unlinkSync(filePath); } catch {}
      reject(new Error(String(e?.message || e || "Erro desconhecido")));
    });
  });
}

export function cleanCache() {
  try {
    for (const f of fs.readdirSync(config.cacheDir)) {
      fs.unlinkSync(path.join(config.cacheDir, f));
    }
  } catch {}
}
