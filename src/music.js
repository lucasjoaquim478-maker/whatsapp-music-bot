import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let ffmpegDir = null;
try { ffmpegDir = path.dirname(require("ffmpeg-static")); } catch {}

const cacheDir = path.join(__dirname, "..", "temp");
const ytDlp = path.join(cacheDir, "yt-dlp.exe");
const maxDur = 7200;

async function ensureYtDlp() {
  if (fs.existsSync(ytDlp)) {
    const stat = fs.statSync(ytDlp);
    if (stat.size < 10000) { fs.unlinkSync(ytDlp); } else { return; }
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const r = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe");
  if (!r.ok) throw new Error("Falha ao baixar yt-dlp.exe (HTTP " + r.status + ")");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 10000) throw new Error("yt-dlp.exe baixado parece invalido (" + buf.length + " bytes)");
  fs.writeFileSync(ytDlp, buf);
}

function spawnYt(args, timeout) {
  return new Promise((resolve, reject) => {
    let o = "", e = "";
    const p = spawn(ytDlp, args, { timeout });
    p.stdout.on("data", (d) => { o += d.toString(); });
    p.stderr.on("data", (d) => { e += d.toString(); });
    p.on("close", (c) => {
      if (o.trim()) resolve(o.trim());
      else reject(new Error((e || `Código ${c}`).slice(0, 300)));
    });
    p.on("error", (er) => reject(er));
  });
}

export async function searchMusic(query) {
  await ensureYtDlp();
  const json = await spawnYt(["ytsearch2:" + query, "--dump-json", "--no-check-certificates", "--no-warnings", "--no-playlist"], 20000);
  const results = [];
  for (const line of json.split("\n").filter(l => l.trim())) {
    try {
      const d = JSON.parse(line);
      if (d && d.id && (d.duration || 0) <= maxDur)
        results.push({ title: d.title || "", url: `https://youtube.com/watch?v=${d.id}`, duration: d.duration || 0, thumbnail: d.thumbnail || "" });
    } catch {}
  }
  if (!results.length) throw new Error("Nenhum resultado encontrado");
  return results;
}

export async function downloadAudio(videoUrl) {
  await ensureYtDlp();
  const ext = ffmpegDir ? "mp3" : "%(ext)s";
  const out = path.join(cacheDir, `audio_%(id)s.${ext}`);
  const args = [
    videoUrl, "-f", "bestaudio[protocol!=m3u8]/bestaudio/best",
    "--output", out, "--no-part", "--no-mtime",
    "--prefer-free-formats", "--no-check-certificates", "--no-warnings",
  ];
  if (ffmpegDir) args.push("--extract-audio", "--audio-format", "mp3", "--ffmpeg-location", ffmpegDir);

  return new Promise((resolve, reject) => {
    let err = "";
    const p = spawn(ytDlp, args, { timeout: 300000 });

    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      try {
        const files = fs.readdirSync(cacheDir).filter(f => f.startsWith("audio_"));
        for (const f of files) {
          const fp = path.join(cacheDir, f);
          if (fs.statSync(fp).size > 1000) return resolve(fp);
        }
        reject(new Error((err || `Código ${c}`).slice(0, 300)));
      } catch (e) { reject(new Error(String(e && e.message ? e.message : e))); }
    });
    p.on("error", (e) => reject(new Error(String(e && e.message ? e.message : e))));
  });
}

export async function downloadVideo(videoUrl) {
  await ensureYtDlp();
  const out = path.join(cacheDir, "video_%(id)s.%(ext)s");
  const args = [
    videoUrl, "-f", "best[height<=360][filesize<50M]/bestvideo[height<=360]+bestaudio/best[height<=360]",
    "--merge-output-format", "mp4",
    "--output", out, "--no-part", "--no-mtime",
    "--no-check-certificates", "--no-warnings",
  ];
  if (ffmpegDir) args.push("--ffmpeg-location", ffmpegDir);

  return new Promise((resolve, reject) => {
    let err = "";
    const p = spawn(ytDlp, args, { timeout: 300000 });

    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      try {
        const files = fs.readdirSync(cacheDir).filter(f => f.startsWith("video_"));
        for (const f of files) {
          const fp = path.join(cacheDir, f);
          if (fs.statSync(fp).size > 1000) return resolve(fp);
        }
        reject(new Error((err || `Código ${c}`).slice(0, 300)));
      } catch (e) { reject(new Error(String(e && e.message ? e.message : e))); }
    });
    p.on("error", (e) => reject(new Error(String(e && e.message ? e.message : e))));
  });
}

export function cleanCache() {
  try {
    for (const f of fs.readdirSync(cacheDir)) {
      const full = path.join(cacheDir, f);
      if (f !== "yt-dlp.exe" && fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  } catch {}
}
