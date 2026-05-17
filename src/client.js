import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import { getTunnelUrl } from "./dashboard.js";

const { Client, LocalAuth } = pkg;

export function createClient(onMessage, dash = {}) {
  const { setStatus, setQR } = dash;
  let currentClient = null;
  let readyPromise = Promise.resolve();
  let markReady = null;
  let connecting = false;
  let retries = 0;

  function blockUntilReady() {
    readyPromise = new Promise(r => { markReady = r; });
  }

  function releaseReady() {
    if (markReady) markReady();
    markReady = null;
    connecting = false;
  }

  async function cleanup() {
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
      authStrategy: new LocalAuth({ dataPath: process.env.RAILWAY_VOLUME_MOUNT_PATH || "./session" }),
      puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: [
          "--no-sandbox", "--disable-setuid-sandbox",
          "--disable-dev-shm-usage", "--disable-gpu",
          "--no-zygote", "--single-process",
          "--no-first-run", "--disable-accelerated-2d-canvas",
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
      if (msg.includes("CERT") || msg.includes("certificate")) {
        console.log("⚠️ Erro de certificado - limpando sessão...");
        const sessionPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || "./session";
        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(".wwebjs_auth", { recursive: true, force: true }); } catch {}
        try { fs.rmSync(".wwebjs_cache", { recursive: true, force: true }); } catch {}
      }
      cleanup();
      releaseReady();
      const delay = Math.min(10000 * Math.pow(2, retries), 120000);
      retries++;
      scheduleReconnect(delay);
    });
  }

  buildClient();
}
