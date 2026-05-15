import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { config } from "./config.js";

const require = createRequire(import.meta.url);
let ffmpegPath = null;
try {
  ffmpegPath = require("ffmpeg-static");
} catch {}

const ytDlpPath = path.join(config.cacheDir, "yt-dlp.exe");

async function ensureYtDlp() {
  if (fs.existsSync(ytDlpPath)) return;
  if (!fs.existsSync(config.cacheDir)) fs.mkdirSync(config.cacheDir, { recursive: true });
  const res = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe");
  if (!res.ok) throw new Error("Falha ao baixar yt-dlp.exe");
  fs.writeFileSync(ytDlpPath, Buffer.from(await res.arrayBuffer()));
}

function runYtDlp(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let out = "", err = "";
    const proc = spawn(ytDlpPath, args, { timeout });
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("close", (code) => {
      if (out.trim()) return resolve(out.trim());
      reject(new Error((err || `Código ${code}`).slice(0, 300)));
    });
    proc.on("error", (e) => reject(new Error(e.message)));
  });
}

export async function searchMusic(query) {
  await ensureYtDlp();
  try {
    const json = await runYtDlp([
      "ytsearch1:" + query, "--dump-json", "--no-check-certificates", "--no-warnings",
    ], 20000);
    const data = JSON.parse(json.split("\n")[0]);
    if (!data || !data.id) throw Error("vazio");
    if ((data.duration || 0) > config.maxDuration) {
      throw new Error(`Música muito longa (máx ${Math.floor(config.maxDuration / 60)}min).`);
    }
    return {
      title: data.title || "Desconhecido",
      url: `https://youtube.com/watch?v=${data.id}`,
      duration: data.duration || 0,
      thumbnail: data.thumbnail || "",
    };
  } catch (e) {
    if (e.message.includes("muito longa")) throw e;
    throw new Error(e.message || "Nenhum resultado encontrado");
  }
}

export async function downloadAudio(videoUrl) {
  if (!fs.existsSync(config.cacheDir)) fs.mkdirSync(config.cacheDir, { recursive: true });
  await ensureYtDlp();

  const output = path.join(config.cacheDir, `audio_%(id)s.mp3`);
  const args = [
    videoUrl,
    "-f", "bestaudio[protocol!=m3u8]/bestaudio/best",
    "--output", output,
    "--no-part",
    "--no-mtime",
    "--prefer-free-formats",
    "--no-check-certificates",
    "--no-warnings",
  ];

  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    args.push("--extract-audio", "--audio-format", "mp3", "--ffmpeg-location", path.dirname(ffmpegPath));
  }

  return new Promise((resolve, reject) => {
    let stderr = "";
    const proc = spawn(ytDlpPath, args, { timeout: 120000 });
    proc.stdout.on("data", () => {});
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      const files = fs.readdirSync(config.cacheDir)
        .filter(f => f.startsWith("audio_") && f.endsWith(".mp3"))
        .sort();
      for (const f of files) {
        const fp = path.join(config.cacheDir, f);
        if (fs.statSync(fp).size > 1000) return resolve(fp);
      }
      reject(new Error((stderr || `Código ${code}`).slice(0, 300)));
    });
    proc.on("error", (e) => reject(new Error(String(e))));
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
