import ytdl from "@distube/ytdl-core";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const agent = ytdl.createAgent([
  {
    url: "",
    cookies: [],
  },
]);

const requestOptions = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  },
};

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

  const info = await ytdl.getInfo(videoUrl, { agent, requestOptions });
  const format =
    ytdl.chooseFormat(info.formats, {
      quality: "lowest",
      filter: (f) => f.hasAudio && !f.hasVideo,
    }) ||
    ytdl.chooseFormat(info.formats, {
      quality: "lowest",
      filter: "audioonly",
    });

  if (!format) throw new Error("Nenhum formato de áudio encontrado.");

  const ext = format.container || "m4a";
  const safeName = info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const filePath = path.join(config.cacheDir, `${safeName}.${ext}`);

  return new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format, agent, requestOptions })
      .pipe(fs.createWriteStream(filePath));

    stream.on("finish", () => resolve(filePath));
    stream.on("error", (err) => {
      try { fs.unlinkSync(filePath); } catch {}
      reject(err);
    });
  });
}

export function cleanCache() {
  try {
    const files = fs.readdirSync(config.cacheDir);
    for (const f of files) {
      fs.unlinkSync(path.join(config.cacheDir, f));
    }
  } catch {}
}
