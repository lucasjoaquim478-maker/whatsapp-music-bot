# WhatsApp Music Bot

Bot do WhatsApp que busca música na internet e envia em MP3 usando inteligência artificial (Gemini).

## Como usar

1. Instale as dependências:
   ```
   npm install
   ```

2. Copie o `.env.example` para `.env` e adicione sua chave da API Gemini:
   ```
   GEMINI_API_KEY=sua_chave_aqui
   ```

3. Execute:
   ```
   npm start
   ```

4. Escaneie o QR Code com o WhatsApp para conectar.

5. Envie mensagens como:
   - "quero ouvir [música]"
   - "toca [música]"
   - "[nome da música]"

## Tecnologias

- WhatsApp Web JS
- Google Gemini AI
- YouTube DL (ytdl-core)
- yt-search

## Requisitos

- Node.js 18+
- Google Chrome (instalado automaticamente pelo Puppeteer)
- Conta gratuita do Google AI Studio para chave Gemini
