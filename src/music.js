import { execFile } from "child_process";
import ytSearch from "yt-search";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const binDir = path.join(config.cacheDir, "bin");

function binPath(name) {
  return path.join(binDir, name);
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${dest}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function ensureTools() {
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  if (!fs.existsSync(binPath("yt-dlp.exe"))) {
    await downloadFile(
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
      binPath("yt-dlp.exe")
    );
  }

  if (!fs.existsSync(binPath("ffmpeg.exe"))) {
    const zipPath = path.join(config.cacheDir, "ffmpeg.zip");
    await downloadFile(
      "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
      zipPath
    );
    // Extract ffmpeg.exe and ffprobe.exe from the zip
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    for (const entry of entries) {
      const name = path.basename(entry.entryName);
      if (name === "ffmpeg.exe" || name === "ffprobe.exe") {
        const outPath = binPath(name);
        if (!fs.existsSync(outPath)) {
          fs.writeFileSync(outPath, entry.getData());
        }
      }
    }
    fs.unlinkSync(zipPath);
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

  await ensureTools();

  const output = path.join(config.cacheDir, `audio_%(id)s.%(ext)s`);

  return new Promise((resolve, reject) => {
    const proc = execFile(
      binPath("yt-dlp.exe"),
      [
        videoUrl,
        "--extract-audio",
        "--audio-format", "mp3",
        "--output", output,
        "--ffmpeg-location", binDir,
        "--no-check-certificates",
        "--no-warnings",
        "--prefer-free-formats",
      ],
      { timeout: 180000, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !fs.existsSync(config.cacheDir)) {
          return reject(new Error(err.message));
        }

        const files = fs.readdirSync(config.cacheDir);
        const audioFile = files.find((f) => f.startsWith("audio_"));
        if (!audioFile) return reject(new Error("Áudio não foi gerado."));

        resolve(path.join(config.cacheDir, audioFile));
      }
    );
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
