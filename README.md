# WhatsApp Music Bot

Bot do WhatsApp que busca música na internet e envia em MP3 usando inteligência artificial (Gemini).

## Como usar (Desktop Windows)

1. Baixe o **launcher.exe** na página de [Releases](https://github.com/lucasjoaquim478-maker/whatsapp-music-bot/releases) do GitHub
2. Coloque em uma pasta vazia
3. Crie um arquivo `.env` na mesma pasta com sua chave Gemini:
   ```
   GEMINI_API_KEY=sua_chave_aqui
   ```
4. Execute o `launcher.exe` — ele vai:
   - Verificar se há atualizações automaticamente
   - Baixar e instalar se tiver versão nova
   - Instalar dependências
   - Iniciar o bot

5. Escaneie o QR Code com o WhatsApp para conectar.

6. Envie mensagens como:
   - "quero ouvir [música]"
   - "toca [música]"
   - "[nome da música]"

### Via código fonte

1. Clone o repositório e instale as dependências:
   ```
   git clone https://github.com/lucasjoaquim478-maker/whatsapp-music-bot.git
   cd whatsapp-music-bot
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

## Tecnologias

- WhatsApp Web JS
- Google Gemini AI
- YouTube DL (ytdl-core)
- yt-search

## Requisitos

- Node.js 18+
- Google Chrome (instalado automaticamente pelo Puppeteer)
- Conta gratuita do Google AI Studio para chave Gemini
