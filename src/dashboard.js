import express from "express";
import http from "http";

const logs = [];
const maxLogs = 500;
let sseClients = [];
let botStatus = "iniciando";
let qrData = null;

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
    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
    });
  });

  app.get("/api/status", (req, res) => {
    res.json({ status: botStatus, qr: qrData });
  });

  app.get("/", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Bot - Dashboard</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:system-ui,sans-serif; background:#111; color:#eee; padding:20px; }
    h1 { color:#25D366; margin-bottom:10px; }
    #status { padding:10px 15px; border-radius:8px; display:inline-block; margin-bottom:20px; font-weight:bold; }
    .online { background:#075E54; color:#fff; }
    .offline { background:#333; color:#999; }
    .iniciando { background:#1a3a2a; color:#25D366; }
    #logs { background:#1a1a1a; border-radius:8px; padding:15px; height:60vh; overflow-y:auto; font-family:monospace; font-size:13px; }
    .log-entry { padding:2px 0; border-bottom:1px solid #222; }
    .log-time { color:#666; margin-right:10px; }
    .log-INFO { color:#4fc3f7; }
    .log-ERROR { color:#ef5350; }
    .log-WARN { color:#ffa726; }
    .log-SYSTEM { color:#aaa; }
    .log-COMMAND { color:#81c784; }
    #qr { margin-top:15px; }
    #qr img { max-width:300px; border-radius:8px; }
    #qr { display:none; }
    .footer { margin-top:15px; color:#555; font-size:12px; }
  </style>
</head>
<body>
  <h1>WhatsApp Bot</h1>
  <div id="status" class="iniciando">Conectando...</div>
  <div id="qr"></div>
  <h2 style="margin:15px 0 10px">Logs</h2>
  <div id="logs"></div>
  <div class="footer">Logs em tempo real</div>

<script>
const statusEl = document.getElementById("status");
const qrEl = document.getElementById("qr");
const logsEl = document.getElementById("logs");

const evtSource = new EventSource("/api/logs/stream");
evtSource.onmessage = (e) => {
  const entry = JSON.parse(e.data);
  const div = document.createElement("div");
  div.className = "log-entry log-" + entry.level;
  div.innerHTML = '<span class="log-time">' + entry.time.slice(11,19) + '</span>[' + entry.level + '] ' + escapeHtml(entry.msg);
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
    statusEl.textContent = data.status === "connected" ? "Conectado" : data.status === "disconnected" ? "Desconectado" : "Conectando...";
    statusEl.className = data.status === "connected" ? "online" : data.status === "disconnected" ? "offline" : "iniciando";
    if (data.qr) {
      qrEl.style.display = "block";
      qrEl.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(data.qr) + '" alt="QR Code">';
    } else {
      qrEl.style.display = "none";
    }
  } catch {}
}
setInterval(updateStatus, 2000);
updateStatus();
</script>
</body>
</html>`);
  });

  server.listen(port, () => {
    emitLog("SYSTEM", `Dashboard: http://localhost:${port}`);
  });
}
