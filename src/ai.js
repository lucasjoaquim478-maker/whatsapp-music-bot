import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "./config.js";

const SYSTEM_PROMPT = `Você é um assistente de música para um bot do WhatsApp.
Sua função é interpretar mensagens do usuário e extrair informações musicais.

IMPORTANTE: Responda APENAS com um JSON válido, sem formatação extra.

Se o usuário pedir uma música, artista ou álbum, responda:
{"type":"music","query":"<termo de busca>"}

Se for um comando de ajuda ou saudação, ou se o usuário pedir ajuda, responda:
{"type":"help","message":"Use !help para ver os comandos"}

Se não for relacionado a música, responda:
{"type":"unknown","message":"<mensagem educada>"}`;

let model = null;

function getModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }
  return model;
}

export async function interpretMessage(text) {
  if (!config.geminiApiKey) {
    return { type: "help", message: "Chave da API Gemini não configurada." };
  }

  try {
    const m = getModel();
    const result = await m.generateContent([SYSTEM_PROMPT, text]);
    const response = result.response.text().trim();
    const cleaned = response.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { type: "help", message: "Não entendi. Diga algo como: 'quero ouvir [música]'" };
  }
}
