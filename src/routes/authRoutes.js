/**
 * @file src/routes/authRoutes.js
 * @description Rotas de Autenticação OAuth2 do Discord e gerenciamento de sessão de usuário.
 * @module routes/authRoutes
 */

const express = require('express');
const path = require('path');

/**
 * Cria o Router de Autenticação do Express.
 *
 * @param {import('discord.js').Client} client - Cliente do Bot do Discord.
 * @param {string} clientId - Client ID do Bot decodificado do Token.
 * @param {number} port - Porta do servidor Express.
 * @returns {express.Router} Router do Express com as rotas de auth.
 */
function createAuthRouter(client, clientId, port) {
  const router = express.Router();

  // --- Rotas de Páginas de Login e Dashboard ---

  router.get('/', (req, res) => {
    if (req.session && req.session.user) {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    } else {
      res.redirect('/login');
    }
  });

  router.get('/login', (req, res) => {
    if (req.session && req.session.user) {
      return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../public/login.html'));
  });

  router.get('/editor', (req, res) => {
    const guild = req.query.guild || req.query.guildId;
    if (guild) return res.redirect(`/server?guild=${guild}&tab=create`);
    res.redirect('/server?tab=create');
  });

  router.get('/editar', (req, res) => {
    const guild = req.query.guild || req.query.guildId;
    if (guild) return res.redirect(`/server?guild=${guild}&tab=edit`);
    res.redirect('/server?tab=edit');
  });

  router.get('/sugestoes', (req, res) => {
    const guild = req.query.guild || req.query.guildId;
    if (guild) return res.redirect(`/server?guild=${guild}&tab=suggestions`);
    res.redirect('/server?tab=suggestions');
  });

  router.get('/server', (req, res) => {
    if (req.session && req.session.user) {
      res.sendFile(path.join(__dirname, '../public/server-dashboard.html'));
    } else {
      res.redirect('/login');
    }
  });

  // --- Fluxo OAuth2 do Discord ---
  const crypto = require('crypto');

  router.get('/api/auth/discord', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    if (req.session) {
      req.session.oauthState = state;
    }
    const redirectUri = process.env.REDIRECT_URI || `http://localhost:${port}/api/auth/callback`;
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds&state=${state}`;
    res.redirect(discordAuthUrl);
  });

  router.get('/api/auth/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect('/login?error=no_code');
    }

    if (req.session && req.session.oauthState && state !== req.session.oauthState) {
      console.warn('[AUTH] Mismatch state parameter in OAuth callback.');
      return res.redirect('/login?error=invalid_state');
    }

    // Limpa o state utilizado
    if (req.session) {
      delete req.session.oauthState;
    }

    const redirectUri = process.env.REDIRECT_URI || `http://localhost:${port}/api/auth/callback`;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!clientSecret) {
      console.error('[AUTH] CLIENT_SECRET não foi definido no arquivo .env.');
      return res.send('Erro de configuração no servidor: Falta CLIENT_SECRET no .env.');
    }

    try {
      // 1. Troca o código pelo Token de Acesso
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: redirectUri
        })
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(tokenData.error_description || 'Falha ao trocar o token.');
      }

      // 2. Busca informações do perfil do usuário no Discord
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `${tokenData.token_type} ${tokenData.access_token}` }
      });

      const userData = await userResponse.json();
      if (!userResponse.ok) {
        throw new Error('Falha ao buscar perfil do usuário no Discord.');
      }

      // 3. Busca servidores onde o usuário é membro
      const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `${tokenData.token_type} ${tokenData.access_token}` }
      });

      const guildsData = await guildsResponse.json();
      if (!guildsResponse.ok) {
        throw new Error('Falha ao buscar servidores do usuário no Discord.');
      }

      // Filtra servidores onde o usuário é Administrador ou Dono
      const adminGuilds = guildsData.filter(g => {
        if (g.owner) return true;
        if (g.permissions) {
          try {
            return (BigInt(g.permissions) & 0x8n) === 0x8n;
          } catch {
            return false;
          }
        }
        return false;
      }).map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon
      }));

      // Verificação de autorização (Administrador ou ID em ADMIN_IDS)
      const allowedAdminIds = process.env.ADMIN_IDS 
        ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) 
        : [];

      const hasBotInAnyAdminGuild = adminGuilds.some(g => client.guilds.cache.has(g.id));
      const isAuthorized = allowedAdminIds.includes(userData.id) || hasBotInAnyAdminGuild;

      if (isAuthorized) {
        req.session.user = {
          id: userData.id,
          username: userData.username,
          avatar: userData.avatar
        };
        req.session.guilds = adminGuilds;
        res.redirect('/');
      } else {
        res.redirect('/login?error=unauthorized');
      }
    } catch (err) {
      console.error('[AUTH] Erro no fluxo OAuth2:', err);
      res.redirect('/login?error=auth_failed');
    }
  });

  router.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
  });

  router.get('/api/user', (req, res) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    res.json({ user: req.session.user });
  });

  return router;
}

module.exports = createAuthRouter;
