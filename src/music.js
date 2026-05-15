import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const ytDlp = path.join(config.cacheDir, "yt-dlp.exe");

async function ensureYtDlp() {
  if (fs.existsSync(ytDlp)) return;
  fs.mkdirSync(config.cacheDir, { recursive: true });
  const r = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe");
  if (!r.ok) throw new Error("Falha ao baixar yt-dlp.exe");
  fs.writeFileSync(ytDlp, Buffer.from(await r.arrayBuffer()));
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
  const json = await spawnYt(["ytsearch5:" + query, "--dump-json", "--no-check-certificates", "--no-warnings", "--no-playlist"], 30000);
  const results = [];
  for (const line of json.split("\n").filter(l => l.trim())) {
    try {
      const d = JSON.parse(line);
      if (d && d.id && (d.duration || 0) <= config.maxDuration)
        results.push({ title: d.title || "", url: `https://youtube.com/watch?v=${d.id}`, duration: d.duration || 0, thumbnail: d.thumbnail || "" });
    } catch {}
  }
  if (!results.length) throw new Error("Nenhum resultado encontrado");
  return results;
}

export async function downloadAudio(videoUrl) {
  await ensureYtDlp();
  const out = path.join(config.cacheDir, `audio_%(id)s.%(ext)s`);

  return new Promise((resolve, reject) => {
    let err = "";
    const p = spawn(ytDlp, [
      videoUrl, "-f", "bestaudio[protocol!=m3u8]/bestaudio/best",
      "--output", out, "--no-part", "--no-mtime",
      "--prefer-free-formats", "--no-check-certificates", "--no-warnings",
    ], { timeout: 120000 });

    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("close", (c) => {
      try {
        const files = fs.readdirSync(config.cacheDir).filter(f => f.startsWith("audio_"));
        for (const f of files) {
          const fp = path.join(config.cacheDir, f);
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
    for (const f of fs.readdirSync(config.cacheDir)) {
      const full = path.join(config.cacheDir, f);
      if (f !== "yt-dlp.exe" && fs.statSync(full).isFile()) fs.unlinkSync(full);
    }
  } catch {}
}
