import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const ytDlp = path.join(config.cacheDir, "yt-dlp.exe");
const ffmpeg = path.join(config.cacheDir, "ffmpeg.exe");
let hasFfmpeg = false;

async function dl(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function ensureTools() {
  fs.mkdirSync(config.cacheDir, { recursive: true });

  if (!fs.existsSync(ytDlp)) {
    await dl("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", ytDlp);
  }

  if (!fs.existsSync(ffmpeg)) {
    try {
      const zip = path.join(config.cacheDir, "ff.zip");
      await dl("https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zip);
      execSync(`powershell -Command "Expand-Archive -Path '${zip}' -DestinationPath '${config.cacheDir}\\ff_temp' -Force"`, { timeout: 30000 });

      const entries = fs.readdirSync(path.join(config.cacheDir, "ff_temp"));
      for (const e of entries) {
        findFfmpeg(path.join(config.cacheDir, "ff_temp", e));
      }
      fs.rmSync(path.join(config.cacheDir, "ff_temp"), { recursive: true, force: true });
      fs.unlinkSync(zip);
      hasFfmpeg = fs.existsSync(ffmpeg);
    } catch (e) {
      console.log("FFmpeg não disponível, baixando sem conversão:", e.message);
      hasFfmpeg = false;
      try { fs.unlinkSync(path.join(config.cacheDir, "ff.zip")); } catch {}
      try { fs.rmSync(path.join(config.cacheDir, "ff_temp"), { recursive: true, force: true }); } catch {}
    }
  } else {
    hasFfmpeg = true;
  }
}

function findFfmpeg(dir) {
  try {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) findFfmpeg(full);
      else if (item === "ffmpeg.exe") fs.copyFileSync(full, ffmpeg);
    }
  } catch {}
}

function run(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let o = "", e = "";
    const p = spawn(ytDlp, args, { timeout });
    p.stdout.on("data", (d) => { o += d.toString(); });
    p.stderr.on("data", (d) => { e += d.toString(); });
    p.on("close", (c) => {
      if (o.trim()) resolve(o.trim());
      else reject(new Error((e || `Código ${c}`).slice(0, 500)));
    });
    p.on("error", (er) => reject(er));
  });
}

export async function searchMusic(query) {
  await ensureTools();
  const json = await run(["ytsearch5:" + query, "--dump-json", "--no-check-certificates", "--no-warnings", "--no-playlist"], 30000);
  const results = [];
  for (const line of json.split("\n").filter(l => l.trim())) {
    try {
      const d = JSON.parse(line);
      if (d && d.id && (d.duration || 0) <= config.maxDuration) {
        results.push({ title: d.title || "", url: `https://youtube.com/watch?v=${d.id}`, duration: d.duration || 0, thumbnail: d.thumbnail || "" });
      }
    } catch {}
  }
  if (!results.length) throw new Error("Nenhum resultado encontrado");
  return results;
}

export async function downloadAudio(videoUrl) {
  await ensureTools();
  const ext = hasFfmpeg ? "mp3" : "%(ext)s";
  const out = path.join(config.cacheDir, `audio_%(id)s.${ext}`);
  const args = [
    videoUrl, "-f", "bestaudio[protocol!=m3u8]/bestaudio/best",
    "--output", out, "--no-part", "--no-mtime",
    "--prefer-free-formats", "--no-check-certificates", "--no-warnings",
  ];
  if (hasFfmpeg) args.push("--extract-audio", "--audio-format", "mp3", "--ffmpeg-location", config.cacheDir);

  return new Promise((resolve, reject) => {
    let err = "";
    const p = spawn(ytDlp, args, { timeout: 180000 });
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      try {
        const files = fs.readdirSync(config.cacheDir).filter(f => f.startsWith("audio_"));
        for (const f of files) {
          const fp = path.join(config.cacheDir, f);
          if (fs.statSync(fp).size > 1000) return resolve(fp);
        }
        reject(new Error((err || `Código ${c}`).slice(0, 500)));
      } catch (e) {
        reject(new Error(String(e && e.message ? e.message : e)));
      }
    });
    p.on("error", (e) => reject(new Error(String(e && e.message ? e.message : e))));
  });
}

export function cleanCache() {
  try {
    for (const f of fs.readdirSync(config.cacheDir)) {
      const full = path.join(config.cacheDir, f);
      if (f !== "yt-dlp.exe" && f !== "ffmpeg.exe" && fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  } catch {}
}
