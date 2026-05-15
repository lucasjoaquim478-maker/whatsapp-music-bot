import ytdl from "@distube/ytdl-core";
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

  const info = await ytdl.getInfo(videoUrl);
  const format = ytdl.chooseFormat(info.formats, {
    quality: "lowestaudio",
    filter: "audioonly",
  });

  const safeName = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const filePath = path.join(config.cacheDir, `${safeName}.mp3`);

  return new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format })
      .pipe(fs.createWriteStream(filePath));

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

export function cleanCache() {
  const files = fs.readdirSync(config.cacheDir);
  for (const f of files) {
    fs.unlinkSync(path.join(config.cacheDir, f));
  }
}
