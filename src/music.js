import { execFile } from "child_process";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const ytDlpPath = path.join(config.cacheDir, "yt-dlp.exe");

async function ensureYtDlp() {
  if (fs.existsSync(ytDlpPath)) return;

  const url =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao baixar yt-dlp.exe");
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(ytDlpPath, buf);
  fs.chmodSync(ytDlpPath, 0o755);
}

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

  await ensureYtDlp();

  const output = path.join(config.cacheDir, `audio_%(id)s.%(ext)s`);

  return new Promise((resolve, reject) => {
    const proc = execFile(
      ytDlpPath,
      [
        videoUrl,
        "--extract-audio",
        "--audio-format", "mp3",
        "--output", output,
        "--no-check-certificates",
        "--no-warnings",
        "--prefer-free-formats",
        "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "--add-header", "Referer:https://www.youtube.com/",
      ],
      { timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(err.message));

        const files = fs.readdirSync(config.cacheDir);
        const audioFile = files.find((f) => f.startsWith("audio_"));
        if (!audioFile) return reject(new Error("Áudio não foi gerado."));

        const filePath = path.join(config.cacheDir, audioFile);
        resolve(filePath);
      }
    );
  });
}

export function cleanCache() {
  try {
    const files = fs.readdirSync(config.cacheDir);
    for (const f of files) {
      if (f !== "yt-dlp.exe") fs.unlinkSync(path.join(config.cacheDir, f));
    }
  } catch {}
}
