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

function pickFormat(formats) {
  const f1 = ytdl.chooseFormat(formats, {
    quality: "lowest",
    filter: (f) => f.hasAudio && !f.hasVideo && f.container === "m4a",
  });
  if (f1) return f1;

  const f2 = ytdl.chooseFormat(formats, {
    quality: "lowest",
    filter: "audioonly",
  });
  if (f2) return f2;

  const f3 = ytdl.chooseFormat(formats, {
    quality: "lowest",
    filter: (f) => f.hasAudio && !f.hasVideo,
  });
  if (f3) return f3;

  return ytdl.chooseFormat(formats, { quality: "lowest" });
}

export async function downloadAudio(videoUrl) {
  if (!fs.existsSync(config.cacheDir)) {
    fs.mkdirSync(config.cacheDir, { recursive: true });
  }

  const info = await ytdl.getInfo(videoUrl, { agent, requestOptions });
  const format = pickFormat(info.formats);

  if (!format) throw new Error("Nenhum formato reproduzível encontrado.");

  const ext = format.container || "webm";
  const safeName = `audio_${Date.now()}`;
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
