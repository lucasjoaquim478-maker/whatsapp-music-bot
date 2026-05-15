import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

export function createClient() {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    },
  });

  client.on("qr", (qr) => {
    console.log("\nEscaneie o QR Code abaixo com o WhatsApp:");
    qrcode.generate(qr, { small: true });
  });

  client.on("authenticated", () => {
    console.log("Autenticado com sucesso!");
  });

  client.on("auth_failure", (msg) => {
    console.error("Falha na autenticação:", msg);
  });

  client.on("ready", () => {
    console.log("WhatsApp conectado e pronto!");
  });

  client.on("disconnected", (reason) => {
    console.log("Desconectado:", reason);
  });

  return client;
}
