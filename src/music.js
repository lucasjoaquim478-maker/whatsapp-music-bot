import { execFile } from "child_process";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const binDir = path.join(config.cacheDir, "bin");
const ytDlpPath = path.join(binDir, "yt-dlp.exe");

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function ensureYtDlp() {
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  if (!fs.existsSync(ytDlpPath)) {
    await downloadFile(
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
      ytDlpPath
    );
  }
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
        "-f", "bestaudio",
        "--output", output,
        "--no-check-certificates",
        "--no-warnings",
        "--add-header", "User-Agent:Mozilla/5.0",
      ],
      { timeout: 180000, maxBuffer: 50 * 1024 * 1024 },
      (err) => {
        if (err) return reject(new Error(err.message));

        const files = fs.readdirSync(config.cacheDir);
        const audioFile = files.find((f) => f.startsWith("audio_"));
        if (!audioFile) return reject(new Error("Áudio não foi gerado."));

        resolve(path.join(config.cacheDir, audioFile));
      }
    );

    proc.stdout.on("data", () => {});
    proc.stderr.on("data", () => {});
  });
}

export function cleanCache() {
  try {
    const files = fs.readdirSync(config.cacheDir);
    for (const f of files) {
      const full = path.join(config.cacheDir, f);
      if (f !== "bin" && fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  } catch {}
}
