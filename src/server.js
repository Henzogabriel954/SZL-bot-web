/**
 * @file src/server.js
 * @description Servidor Express principal do Dashboard do SZL-BOT.
 * Inicializa middlewares, rotas modulares de autenticação, servidores e anúncios.
 * @module server
 */

const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
require('dotenv').config();

const createAuthRouter = require('./routes/authRoutes');
const createGuildRouter = require('./routes/guildRoutes');
const createAnnouncementRouter = require('./routes/announcementRoutes');
const createSuggestionRouter = require('./routes/suggestionRoutes');

/**
 * Inicializa o servidor Express para o Dashboard do SZL-BOT.
 *
 * @param {import('discord.js').Client} client - Cliente do Discord.
 */
function startServer(client) {
  const app = express();
  const port = Number(process.env.PORT) || 9180;

  // Habilita trust proxy se rodando atrás de Nginx/Cloudflare
  app.set('trust proxy', 1);

  // Obtém o Client ID das variáveis de ambiente ou decodifica do Token do Discord
  let clientId = process.env.CLIENT_ID || '';
  if (!clientId) {
    try {
      const token = process.env.DISCORD_TOKEN;
      if (token) {
        clientId = Buffer.from(token.split('.')[0], 'base64').toString('utf-8');
      }
    } catch (error) {
      console.error('[SERVER] Falha ao extrair Client ID do token para OAuth2:', error.message);
    }
  }

  // Configurações da Sessão de Cookie Persistente (48 horas)
  app.use(cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'szl-bot-secure-session-key-9821'],
    maxAge: 48 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }));

  app.use(express.json());

  // Servir arquivos estáticos (CSS, JS, Imagens)
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  // Registra os Routers Modulares
  app.use(createAuthRouter(client, clientId, port));
  app.use(createGuildRouter(client));
  app.use(createAnnouncementRouter(client));
  app.use(createSuggestionRouter(client));

  // Inicializa a escuta na porta configurada
  app.listen(port, () => {
    console.log(`💻 [SERVER] Dashboard do SZL-BOT rodando em http://localhost:${port}`);
  });
}

module.exports = { startServer };
