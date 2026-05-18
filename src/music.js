import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let ffmpegDir = null;
try { ffmpegDir = path.dirname(require("ffmpeg-static")); } catch {}
if (!ffmpegDir) {
  try {
    const { execSync } = require("child_process");
    const which = execSync(process.platform === "win32" ? "where ffmpeg" : "which ffmpeg", { encoding: "utf8", timeout: 5000 });
    ffmpegDir = path.dirname(which.trim().split("\n")[0]);
  } catch {}
}

const cacheDir = path.join(__dirname, "..", "temp");
const isWin = process.platform === "win32";
const ytDlp = isWin ? path.join(cacheDir, "yt-dlp.exe") : "yt-dlp";
const maxDur = 7200;

async function ensureYtDlp() {
  if (isWin) {
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
  const json = await spawnYt(["ytsearch5:" + query, "--dump-json", "--no-check-certificates", "--no-warnings", "--no-playlist", "--extractor-retries", "3", "--extractor-args", "youtube:player_client=android,youtube", "--add-header", "User-Agent:Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36"], 30000);
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

function videoIdFromUrl(url) {
  const m = url.match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

export async function downloadAudio(videoUrl) {
  await ensureYtDlp();
  try { for (const f of fs.readdirSync(cacheDir)) { if (f.startsWith("audio_")) { try { fs.unlinkSync(path.join(cacheDir, f)); } catch {} } } } catch {}
  const vid = videoIdFromUrl(videoUrl);
  const ext = ffmpegDir ? "mp3" : "%(ext)s";
  const out = path.join(cacheDir, `audio_%(id)s.${ext}`);
  const expectedPath = vid ? path.join(cacheDir, `audio_${vid}.${ext === "%(ext)s" ? "webm" : ext}`) : null;
  const args = [
    videoUrl,
    "--output", out, "--no-part", "--no-mtime",
    "--no-check-certificates", "--no-warnings",
    "--extractor-retries", "3", "--throttled-rate", "100M",
    "--add-header", "User-Agent:Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
    "--extractor-args", "youtube:player_client=android,youtube",
  ];
  if (ffmpegDir) {
    args.push("--extract-audio", "--audio-format", "mp3", "--ffmpeg-location", ffmpegDir);
  } else {
    args.push("-f", "bestaudio");
  }

  return new Promise((resolve, reject) => {
    let err = "";
    const p = spawn(ytDlp, args, { timeout: 180000 });

    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      try {
        if (expectedPath && fs.existsSync(expectedPath) && fs.statSync(expectedPath).size > 1000) return resolve(expectedPath);
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

function compressVideo(filePath) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath);
    const out = path.join(cacheDir, "compressed_" + path.basename(filePath).replace(ext, ".mp4"));
    const ff = ffmpegDir ? path.join(ffmpegDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") : "ffmpeg";
    const args = ["-i", filePath, "-vcodec", "libx264", "-crf", "30", "-preset", "fast", "-acodec", "aac", "-b:a", "64k", "-y", out];
    const p = spawn(ff, args, { timeout: 300000 });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      if (c !== 0) return reject(new Error("Compressão falhou"));
      try { fs.unlinkSync(filePath); } catch {}
      resolve(out);
    });
    p.on("error", (e) => reject(e));
  });
}

export async function downloadVideo(videoUrl) {
  await ensureYtDlp();
  try { for (const f of fs.readdirSync(cacheDir)) { if (f.startsWith("video_")) { try { fs.unlinkSync(path.join(cacheDir, f)); } catch {} } } } catch {}
  const vid = videoIdFromUrl(videoUrl);
  const out = path.join(cacheDir, "video_%(id)s.%(ext)s");
  const expectedPath = vid ? path.join(cacheDir, `video_${vid}.mp4`) : null;
  const args = [
    videoUrl, "-f", "best[height<=480]/best",
    "--merge-output-format", "mp4",
    "--output", out, "--no-part", "--no-mtime",
    "--no-check-certificates", "--no-warnings",
    "--extractor-retries", "3", "--throttled-rate", "100M",
    "--add-header", "User-Agent:Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
    "--extractor-args", "youtube:player_client=android,youtube",
  ];
  if (ffmpegDir) args.push("--ffmpeg-location", ffmpegDir);

  const filePath = await new Promise((resolve, reject) => {
    let err = "";
    const p = spawn(ytDlp, args, { timeout: 360000 });

    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      try {
        if (expectedPath && fs.existsSync(expectedPath) && fs.statSync(expectedPath).size > 1000) return resolve(expectedPath);
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

  if (!fs.existsSync(filePath)) throw new Error("Arquivo de video nao encontrado apos download");
  if (fs.statSync(filePath).size > 45 * 1024 * 1024 && ffmpegDir) {
    return await compressVideo(filePath);
  }
  return filePath;
}

export async function fetchPlaylist(url, limit = 5) {
  await ensureYtDlp();
  const json = await spawnYt([url, "--flat-playlist", "--dump-json", "--no-check-certificates", "--no-warnings", "--extractor-retries", "3"], 15000);
  const results = [];
  for (const line of json.split("\n").filter(l => l.trim())) {
    try {
      const d = JSON.parse(line);
      if (d && d.id && results.length < limit)
        results.push({ title: d.title || "", url: `https://youtube.com/watch?v=${d.id}`, duration: d.duration || 0 });
    } catch {}
  }
  return results;
}

export function cleanCache() {
  try {
    for (const f of fs.readdirSync(cacheDir)) {
      const full = path.join(cacheDir, f);
      if (f !== ytDlpBin && fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  } catch {}
}
