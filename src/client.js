import { makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "path";

const authDir = path.join(process.cwd(), "auth");

export async function createClient(onMessage) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    browser: Browsers.windows("WhatsApp Music Bot"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      console.log("\nEscaneie o QR Code abaixo:\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("WhatsApp conectado com sucesso!");
    }
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("Desconectado permanentemente. Delete a pasta 'auth' e reconecte.");
      } else {
        console.log("Reconectando em 5s...");
        setTimeout(() => createClient(onMessage), 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key?.fromMe) continue;
      if (msg.key?.remoteJid?.endsWith("@g.us")) continue;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
      if (!text.trim()) continue;
      await onMessage(sock, msg, text.trim());
    }
  });

  return sock;
}
