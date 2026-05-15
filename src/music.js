import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "./config.js";

const ytDlpPath = path.join(config.cacheDir, "yt-dlp.exe");

async function ensureYtDlp() {
  if (fs.existsSync(ytDlpPath)) return;
  if (!fs.existsSync(config.cacheDir)) fs.mkdirSync(config.cacheDir, { recursive: true });

  const res = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe");
  if (!res.ok) throw new Error("Falha ao baixar yt-dlp.exe");
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(ytDlpPath, buf);
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(ytDlpPath, args, { timeout: 30000 });
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0 && stdout.trim()) return resolve(stdout.trim());
      if (stdout.trim()) return resolve(stdout.trim());
      reject(new Error(stderr.trim() || `Código: ${code}`));
    });
    proc.on("error", (e) => reject(e));
  });
}

export async function searchMusic(query) {
  const json = await runYtDlp([
    "ytsearch1:" + query,
    "--dump-json",
    "--no-check-certificates",
    "--no-warnings",
  ]);

  try {
    const data = JSON.parse(json.split("\n")[0]);
    if (!data) throw Error();
    const duration = data.duration || 0;
    if (duration > config.maxDuration) {
      throw new Error(`Música muito longa (máx ${Math.floor(config.maxDuration / 60)}min).`);
    }
    return {
      title: data.title || "Desconhecido",
      url: data.webpage_url || `https://youtube.com/watch?v=${data.id}`,
      duration,
      thumbnail: data.thumbnail || "",
    };
  } catch (e) {
    if (e.message.includes("muito longa")) throw e;
    throw new Error("Nenhum resultado encontrado.");
  }
}

export async function downloadAudio(videoUrl) {
  if (!fs.existsSync(config.cacheDir)) fs.mkdirSync(config.cacheDir, { recursive: true });
  await ensureYtDlp();

  const output = path.join(config.cacheDir, `audio_%(id)s.%(ext)s`);

  return new Promise((resolve, reject) => {
    let stderr = "";
    const proc = spawn(ytDlpPath, [
      videoUrl,
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "--output", output,
      "--no-check-certificates",
      "--no-warnings",
    ]);

    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      const files = fs.readdirSync(config.cacheDir);
      const audioFile = files.find((f) => f.startsWith("audio_") && f.endsWith(".m4a") || f.startsWith("audio_") && f.endsWith(".webm"));
      if (audioFile) {
        const fp = path.join(config.cacheDir, audioFile);
        if (fs.statSync(fp).size > 1000) return resolve(fp);
      }
      reject(new Error(stderr.slice(0, 400) || `Código: ${code}`));
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
