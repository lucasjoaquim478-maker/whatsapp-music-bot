import youtubedl from "youtube-dl-exec";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

export async function searchMusic(query) {
  const result = await ytSearch(query);
  const video = result.videos?.[0];
  if (!video) throw new Error("Nenhum resultado encontrado.");

  const durationSec = video.seconds || 0;
  if (durationSec > config.maxDuration) {
    throw new Error(`Música muito longa (máx ${config.maxDuration}s).`);
  }

  return {
    title: video.title,
    url: video.url,
    duration: durationSec,
    thumbnail: video.thumbnail,
  };
}

export async function downloadAudio(videoUrl) {
  if (!fs.existsSync(config.cacheDir)) {
    fs.mkdirSync(config.cacheDir, { recursive: true });
  }

  const safeName = `audio_${Date.now()}`;
  const output = path.join(config.cacheDir, `${safeName}.mp3`);

  try {
    await youtubedl(videoUrl, {
      extractAudio: true,
      audioFormat: "mp3",
      output: output,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ["referer:youtube.com", "user-agent:Mozilla/5.0"],
    });

    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error("Arquivo vazio ou não gerado.");
    }

    return output;
  } catch (err) {
    if (fs.existsSync(output)) {
      try { fs.unlinkSync(output); } catch {}
    }
    throw err;
  }
}

export function cleanCache() {
  try {
    const files = fs.readdirSync(config.cacheDir);
    for (const f of files) {
      fs.unlinkSync(path.join(config.cacheDir, f));
    }
  } catch {}
}
