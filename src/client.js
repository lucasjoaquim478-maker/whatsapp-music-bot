import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

export function createClient(onMessage, dash = {}) {
  const { setStatus, setQR } = dash;

  function startClient() {
    let reconnectTimer = null;
    let currentClient = null;

    function cleanup() {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentClient) {
        try { currentClient.destroy(); } catch {}
        currentClient = null;
      }
    }

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: process.env.RAILWAY_VOLUME_MOUNT_PATH || "./session" }),
      puppeteer: {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
    });
    currentClient = client;

    client.on("qr", (qr) => {
      console.log("\nEscaneie o QR Code:\n");
      qrcode.generate(qr, { small: true });
      if (setQR) setQR(qr);
    });

    client.on("authenticated", () => {
      console.log("Autenticado!");
      if (setStatus) setStatus("authenticated");
    });

    client.on("ready", () => {
      console.log("WhatsApp conectado!");
      if (setStatus) setStatus("connected");
      if (setQR) setQR(null);
    });

    client.on("disconnected", (r) => {
      console.log("Desconectado:", r);
      if (setStatus) setStatus("disconnected");
      cleanup();
      reconnectTimer = setTimeout(startClient, 5000);
    });

    client.on("message", async (msg) => {
      if (msg.fromMe) return;
      const text = msg.body?.trim();
      if (!text) return;
      try { await onMessage(client, msg, text); } catch (e) {
        console.error("Erro ao processar mensagem:", e.message);
      }
    });

    client.initialize().catch(e => {
      console.error("Erro ao iniciar cliente:", e.message);
      cleanup();
      reconnectTimer = setTimeout(startClient, 10000);
    });
  }

  startClient();
}
