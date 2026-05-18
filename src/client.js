import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import { getTunnelUrl } from "./dashboard.js";

const { Client, LocalAuth } = pkg;

function resolveSessionPath() {
  const p = process.env.RAILWAY_VOLUME_MOUNT_PATH || "./session";
  try { fs.mkdirSync(p, { recursive: true }); return p; } catch { return "./session"; }
}

export function createClient(onMessage, dash = {}) {
  const { setStatus, setQR } = dash;
  let currentClient = null;
  let readyPromise = Promise.resolve();
  let markReady = null;
  let connecting = false;
  let retries = 0;
  const sessionPath = resolveSessionPath();

  function blockUntilReady() {
    readyPromise = new Promise(r => { markReady = r; });
  }

  function releaseReady() {
    if (markReady) markReady();
    markReady = null;
    connecting = false;
  }

  async function cleanup() {
    connecting = false;
    if (currentClient) {
      try { currentClient.removeAllListeners(); } catch {}
      try { await currentClient.destroy(); } catch {}
      currentClient = null;
    }
  }

  function scheduleReconnect(delay) {
    setTimeout(() => {
      if (!connecting) buildClient();
    }, delay);
  }

  function buildClient() {
    if (connecting) return;
    connecting = true;
    blockUntilReady();
    if (setStatus) setStatus("reconnecting");

    const c = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: [
          "--no-sandbox", "--disable-setuid-sandbox",
          "--disable-dev-shm-usage", "--disable-gpu",
          "--no-zygote",
          "--no-first-run", "--disable-accelerated-2d-canvas",
          "--disable-extensions", "--disable-background-networking",
          "--ignore-certificate-errors",
        ],
      },
    });
    currentClient = c;

    c.on("qr", (qr) => {
      console.log("\nEscaneie o QR Code:\n");
      qrcode.generate(qr, { small: true });
      const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=" + encodeURIComponent(qr);
      console.log("QR URL: " + qrUrl);
      const tunnel = getTunnelUrl();
      if (tunnel) console.log("Dashboard: " + tunnel + "\n");
      if (setQR) setQR(qr);
      if (setStatus) setStatus("qr");
      retries = 0;
    });

    c.on("authenticated", () => {
      console.log("Autenticado!");
      if (setStatus) setStatus("authenticated");
      retries = 0;
    });

    c.on("ready", () => {
      console.log("WhatsApp conectado!");
      if (setStatus) setStatus("connected");
      if (setQR) setQR(null);
      retries = 0;
      releaseReady();
    });

    c.on("disconnected", async (r) => {
      console.log("Desconectado:", r);
      if (setStatus) setStatus("disconnected");
      await cleanup();
      const delay = Math.min(5000 * Math.pow(2, retries), 60000);
      retries++;
      scheduleReconnect(delay);
    });

    c.on("message", async (msg) => {
      if (msg.fromMe) return;
      const text = msg.body?.trim();
      if (!text) return;
      await readyPromise;
      if (!currentClient) return;
      try { await onMessage(currentClient, msg, text); } catch (e) {
        console.error("Erro ao processar mensagem:", e?.message || e);
      }
    });

    c.initialize().catch(e => {
      const msg = e?.message || String(e);
      console.error("Erro ao iniciar cliente:", msg);
      console.log("⚠️ Limpando sessão para nova tentativa...");
      try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch {}
      try { fs.rmSync(".wwebjs_auth", { recursive: true, force: true }); } catch {}
      try { fs.rmSync(".wwebjs_cache", { recursive: true, force: true }); } catch {}
      cleanup();
      releaseReady();
      const delay = Math.min(10000 * Math.pow(2, retries), 120000);
      retries++;
      scheduleReconnect(delay);
    });
  }

  buildClient();
}
