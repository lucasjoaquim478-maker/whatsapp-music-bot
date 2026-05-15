import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const tools = {
  ytDlp: path.join(config.cacheDir, "yt-dlp.exe"),
  ffmpeg: path.join(config.cacheDir, "ffmpeg.exe"),
};

async function dl(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao baixar: HTTP ${r.status}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function ensureTools() {
  fs.mkdirSync(config.cacheDir, { recursive: true });
  if (!fs.existsSync(tools.ytDlp)) {
    await dl("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", tools.ytDlp);
  }
  if (!fs.existsSync(tools.ffmpeg)) {
    await dl("https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip", path.join(config.cacheDir, "ff.zip"));
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(path.join(config.cacheDir, "ff.zip"));
    for (const e of zip.getEntries()) {
      const n = path.basename(e.entryName);
      if (n === "ffmpeg.exe") {
        fs.writeFileSync(tools.ffmpeg, e.getData());
        break;
      }
    }
    fs.unlinkSync(path.join(config.cacheDir, "ff.zip"));
  }
}

function run(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let o = "", e = "";
    const p = spawn(tools.ytDlp, args, { timeout });
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
  const lines = json.split("\n").filter(l => l.trim());
  const results = [];
  for (const line of lines) {
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
  const out = path.join(config.cacheDir, `audio_%(id)s.%(ext)s`);

  return new Promise((resolve, reject) => {
    const p = spawn(tools.ytDlp, [
      videoUrl, "-f", "bestaudio[protocol!=m3u8]/bestaudio/best",
      "--output", out,
      "--extract-audio", "--audio-format", "mp3",
      "--ffmpeg-location", config.cacheDir,
      "--no-part", "--no-mtime", "--prefer-free-formats",
      "--no-check-certificates", "--no-warnings",
    ], { timeout: 180000 });

    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      try {
        const files = fs.readdirSync(config.cacheDir).filter(f => f.startsWith("audio_") && f.endsWith(".mp3"));
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
