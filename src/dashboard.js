import express from "express";
import http from "http";
import { spawn } from "child_process";

const logs = [];
const maxLogs = 500;
let sseClients = [];
let botStatus = "iniciando";
let qrData = null;
let tunnelUrl = null;

export function emitLog(level, msg) {
  const entry = { time: new Date().toISOString(), level, msg };
  logs.push(entry);
  if (logs.length > maxLogs) logs.shift();
  for (const client of sseClients) {
    try { client.write(`data: ${JSON.stringify(entry)}\n\n`); } catch {}
  }
}

export function setStatus(s) { botStatus = s; emitLog("SYSTEM", `Status: ${s}`); }
export function setQR(qr) { qrData = qr; }

export function startDashboard(port = 3000) {
  const app = express();
  const server = http.createServer(app);

  app.get("/api/logs/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    for (const entry of logs) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
    sseClients.push(res);
    const remove = () => { sseClients = sseClients.filter(c => c !== res); };
    req.on("close", remove);
    req.on("error", remove);
  });

  app.get("/api/status", (req, res) => {
    res.json({ status: botStatus, qr: qrData });
  });

  app.get("/", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>WhatsApp Bot</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:system-ui,sans-serif; background:#0d1117; color:#c9d1d9; padding:16px; }
    h1 { color:#25D366; font-size:1.5rem; margin-bottom:12px; }
    .top { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
    #status { padding:6px 14px; border-radius:20px; font-size:0.85rem; font-weight:600; }
    .connected { background:#075E54; color:#fff; }
    .disconnected { background:#3d1f1f; color:#f87171; }
    .reconnecting { background:#1a3a2a; color:#25D366; }
    .authenticated { background:#1a3a5a; color:#60a5fa; }
    .qr { background:#3d2e1f; color:#fbbf24; }
    .iniciando { background:#1a3a2a; color:#25D366; }
    #qr-box { background:#1a1a2e; border-radius:12px; padding:24px; text-align:center; margin-bottom:16px; display:none; border:2px dashed #25D366; }
    #qr-box.visible { display:block; }
    #qr-box h2 { color:#25D366; font-size:1.1rem; margin-bottom:8px; }
    #qr-box p { color:#8b949e; font-size:0.85rem; margin-bottom:16px; }
    #qr-box img { max-width:260px; width:100%; height:auto; border-radius:8px; background:#fff; padding:12px; }
    .logs-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .logs-header h2 { font-size:1rem; color:#8b949e; }
    #clear-logs { background:#21262d; border:1px solid #30363d; color:#c9d1d9; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem; }
    #clear-logs:hover { background:#30363d; }
    #logs { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:10px; height:50vh; overflow-y:auto; font-family:'Cascadia Code','Fira Code','Consolas',monospace; font-size:0.8rem; line-height:1.5; }
    #logs:empty::after { content:"Aguardando logs..."; color:#484f58; }
    .log-entry { padding:1px 0; border-bottom:1px solid #21262d; word-break:break-all; }
    .log-time { color:#484f58; margin-right:8px; user-select:none; }
    .log-INFO { color:#58a6ff; }
    .log-ERROR { color:#f85149; }
    .log-WARN { color:#d29922; }
    .log-SYSTEM { color:#8b949e; }
    .log-COMMAND { color:#3fb950; }
    .footer { margin-top:12px; color:#484f58; font-size:0.75rem; text-align:center; }
    @media (max-width:480px) {
      body { padding:10px; }
      #qr-box { padding:16px; }
      #qr-box img { max-width:200px; }
      #logs { height:40vh; font-size:0.7rem; }
    }
  </style>
</head>
<body>
  <h1>WhatsApp Bot</h1>
  <div class="top">
    <span id="status" class="iniciando">Iniciando...</span>
  </div>
  <div id="qr-box">
    <h2>Escaneie o QR Code</h2>
    <p>Abra o WhatsApp > Menu > Aparelhos conectados > Conectar</p>
    <img id="qr-img" src="" alt="QR Code">
  </div>
  <div class="logs-header">
    <h2>Logs</h2>
    <button id="clear-logs">Limpar</button>
  </div>
  <div id="logs"></div>
  <div class="footer">Logs em tempo real &middot; WhatsApp Bot</div>

<script>
const statusEl = document.getElementById("status");
const qrBox = document.getElementById("qr-box");
const qrImg = document.getElementById("qr-img");
const logsEl = document.getElementById("logs");
const clearBtn = document.getElementById("clear-logs");

clearBtn.onclick = () => { logsEl.innerHTML = ""; };

const evtSource = new EventSource("/api/logs/stream");
evtSource.onmessage = (e) => {
  const entry = JSON.parse(e.data);
  const div = document.createElement("div");
  div.className = "log-entry log-" + entry.level;
  div.innerHTML = '<span class="log-time">' + entry.time.slice(11,19) + '</span>' + escapeHtml(entry.msg);
  logsEl.appendChild(div);
  logsEl.scrollTop = logsEl.scrollHeight;
};

function escapeHtml(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function updateStatus() {
  try {
    const r = await fetch("/api/status");
    const data = await r.json();
    const s = data.status;
    const labels = { connected:"Conectado", disconnected:"Desconectado", reconnecting:"Reconectando", authenticated:"Autenticado", qr:"QR Pronto", iniciando:"Iniciando..." };
    statusEl.textContent = labels[s] || s;
    statusEl.className = s === "connected" ? "connected" : s === "disconnected" ? "disconnected" : s === "reconnecting" ? "reconnecting" : s === "authenticated" ? "authenticated" : s === "qr" ? "qr" : "iniciando";
    if (data.qr) {
      qrBox.className = "visible";
      qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + encodeURIComponent(data.qr);
    } else {
      qrBox.className = "";
      qrImg.src = "";
    }
  } catch {}
}
setInterval(updateStatus, 2000);
updateStatus();
</script>
</body>
</html>`);
  });

  server.on("error", (err) => {
    console.error("Dashboard server error:", err.message);
    emitLog("ERROR", "Dashboard: " + err.message);
  });

  server.listen(port, () => {
    emitLog("SYSTEM", `Dashboard: http://localhost:${port}`);
    startTunnel(port);
  });
}

function startTunnel(port) {
  const isWindows = process.platform === "win32";
  if (isWindows) return;

  const proc = spawn("ssh", ["-R", "80:localhost:" + port, "nokey@localhost.run"], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000,
  });

  proc.stderr.on("data", (data) => {
    const text = data.toString();
    const m = text.match(/https?:\/\/[^\s]+/);
    if (m) {
      tunnelUrl = m[0].replace(/\/$/, "");
      emitLog("SYSTEM", "🌍 Tunnel: " + tunnelUrl);
      console.log("Dashboard publico: " + tunnelUrl);
    }
  });

  proc.on("error", () => {});
  proc.on("close", () => {
    setTimeout(() => startTunnel(port), 30000);
  });
}

export function getTunnelUrl() { return tunnelUrl; }
