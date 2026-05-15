import "dotenv/config";

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  prefix: process.env.PREFIX || "!",
  maxDuration: 600,
  cacheDir: "./temp",
};
