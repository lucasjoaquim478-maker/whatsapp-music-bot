import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

export function createClient(onMessage) {
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
  });

  client.on("authenticated", () => console.log("Autenticado!"));
  client.on("ready", () => console.log("WhatsApp conectado!"));
  client.on("disconnected", (r) => console.log("Desconectado:", r));

  client.on("message", async (msg) => {
    if (msg.fromMe) return;
    const text = msg.body?.trim();
    if (!text) return;
    await onMessage(client, msg, text);
  });

  return client;
}
