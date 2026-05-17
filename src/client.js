import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

export function createClient(onMessage, dash = {}) {
  const { setStatus, setQR } = dash;

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
  });

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
  });

  client.on("message", async (msg) => {
    if (msg.fromMe) return;
    const text = msg.body?.trim();
    if (!text) return;
    await onMessage(client, msg, text);
  });

  return client;
}
