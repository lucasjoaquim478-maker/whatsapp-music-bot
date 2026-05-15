import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";

function findChrome() {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function createClient() {
  const puppeteerOpts = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  };

  const chromePath = findChrome();
  if (chromePath) {
    puppeteerOpts.executablePath = chromePath;
  }

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerOpts,
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
