import { spawn } from "child_process";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const ytDlpPath = path.join(config.cacheDir, "yt-dlp.exe");

async function ensureYtDlp() {
  if (fs.existsSync(ytDlpPath)) return;
  if (!fs.existsSync(config.cacheDir)) fs.mkdirSync(config.cacheDir, { recursive: true });

  const res = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe");
  if (!res.ok) throw new Error("Falha ao baixar yt-dlp.exe");
  fs.writeFileSync(ytDlpPath, Buffer.from(await res.arrayBuffer()));
}

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
  if (!fs.existsSync(config.cacheDir)) fs.mkdirSync(config.cacheDir, { recursive: true });
  await ensureYtDlp();

  const output = path.join(config.cacheDir, `audio_%(id)s.%(ext)s`);

  return new Promise((resolve, reject) => {
    let stderr = "";
    const proc = spawn(ytDlpPath, [
      videoUrl,
      "-f", "bestaudio",
      "--output", output,
      "--no-check-certificates",
      "--no-warnings",
      "--print", "filename",
    ]);

    proc.stdout.on("data", () => {});
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      const files = fs.readdirSync(config.cacheDir);
      const audioFile = files.find((f) => f.startsWith("audio_"));
      if (audioFile) return resolve(path.join(config.cacheDir, audioFile));
      reject(new Error(stderr || "Falha ao baixar áudio"));
    });
    proc.on("error", (e) => reject(new Error(e.message)));
  });
}

export function cleanCache() {
  try {
    for (const f of fs.readdirSync(config.cacheDir)) {
      const full = path.join(config.cacheDir, f);
      if (f !== "yt-dlp.exe" && fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  } catch {}
}
