/**
 * @file src/routes/guildRoutes.js
 * @description Rotas da API Express para gerenciamento de servidores, canais e busca de mensagens.
 * @module routes/guildRoutes
 */

const express = require('express');
const { ChannelType } = require('discord.js');
const prisma = require('../database');
const { requireAuth, isUserGuildAdmin } = require('../middlewares/auth');
const MessageService = require('../services/messageService');

/**
 * Cria o Router de Servidores e Canais do Express.
 *
 * @param {import('discord.js').Client} client - Cliente do Bot do Discord.
 * @returns {express.Router} Router do Express com as rotas de guildas.
 */
function createGuildRouter(client) {
  const router = express.Router();

  // Retorna a lista de servidores em comum onde o usuário logado é Admin
  router.get('/api/guilds', requireAuth, (req, res) => {
    const userGuilds = req.session.guilds || [];
    const guildsWithBot = userGuilds.filter(g => client.guilds.cache.has(g.id));
    res.json({ guilds: guildsWithBot });
  });

  // Retorna os canais de texto de um servidor específico
  router.get('/api/guilds/:guildId/channels', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este servidor.' });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'O bot não está nesse servidor.' });
      }

      const channels = guild.channels.cache
        .filter(c => c.isTextBased())
        .map(c => ({ id: c.id, name: c.name, isThread: c.isThread() }));

      res.json({ channels });
    } catch (err) {
      console.error('[GUILD_ROUTES] Erro ao buscar canais:', err);
      res.status(500).json({ error: 'Erro ao buscar canais do servidor.' });
    }
  });

  // Retorna a lista de cargos (roles) de um servidor específico (Ultra rápido via Cache)
  router.get('/api/guilds/:guildId/roles', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este servidor.' });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'O bot não está nesse servidor.' });
      }

      // Se o cache estiver vazio, realiza a busca na API do Discord
      if (guild.roles.cache.size <= 1) {
        await guild.roles.fetch().catch(() => null);
      }

      const roles = guild.roles.cache
        .filter(r => r.name !== '@everyone' && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map(r => ({
          id: r.id,
          name: r.name,
          color: r.hexColor !== '#000000' ? r.hexColor : '#c9cdfb',
          position: r.position
        }));

      res.json({ roles });
    } catch (err) {
      console.error('[GUILD_ROUTES] Erro ao buscar cargos:', err);
      res.status(500).json({ error: 'Erro ao buscar cargos do servidor.' });
    }
  });

  // Retorna as configurações salvas de um servidor (Paralelo e Ultra Rápido)
  router.get('/api/guilds/:guildId/config', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    try {
      const config = await prisma.guildConfig.findUnique({
        where: { guildId }
      });
      
      let defaultChannelName = '';
      let customChannelName = '';
      let suggestionChannelName = '';

      const guild = client.guilds.cache.get(guildId);
      if (guild && config) {
        // Função auxiliar paralela e otimizada por cache local
        const resolveName = async (id) => {
          if (!id) return '';
          const cached = guild.channels.cache.get(id);
          if (cached) return cached.name;
          const fetched = await guild.channels.fetch(id).catch(() => null);
          return fetched ? fetched.name : 'Canal Desconhecido';
        };

        const [defName, custName, sugName] = await Promise.all([
          resolveName(config.defaultChannelId),
          resolveName(config.customChannelId),
          resolveName(config.suggestionChannelId)
        ]);

        defaultChannelName = defName;
        customChannelName = custName;
        suggestionChannelName = sugName;
      }

      res.json({ 
        config: config || { guildId, defaultChannelId: null, customChannelId: null, suggestionChannelId: null, githubRepo: null, statusTemplate: null },
        defaultChannelName,
        customChannelName,
        suggestionChannelName
      });
    } catch (err) {
      console.error('[GUILD_ROUTES] Erro ao buscar configurações:', err);
      res.status(500).json({ error: 'Erro ao buscar configurações.' });
    }
  });

  // Busca o nome de um canal específico pelo ID (Ultra rápido via Cache)
  router.get('/api/guilds/:guildId/channels/:channelId', requireAuth, async (req, res) => {
    const { guildId, channelId } = req.params;
    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'O bot não está nesse servidor.' });
      }

      // Verifica no cache local do bot primeiro (0ms)
      let channel = guild.channels.cache.get(channelId);
      if (!channel) {
        channel = await guild.channels.fetch(channelId).catch(() => null);
      }

      if (channel && channel.isTextBased()) {
        return res.json({ name: channel.name, isThread: channel.isThread() });
      }

      return res.status(404).json({ error: 'Canal não encontrado ou não suportado.' });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar canal.' });
    }
  });

  // Salva as configurações de um servidor no banco de dados
  router.post('/api/guilds/:guildId/config', requireAuth, async (req, res) => {
    const { guildId } = req.params;
    const { defaultChannelId, customChannelId, suggestionChannelId, githubRepo, statusTemplate } = req.body;

    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    try {
      const config = await prisma.guildConfig.upsert({
        where: { guildId },
        update: { defaultChannelId, customChannelId, suggestionChannelId, githubRepo, statusTemplate },
        create: { guildId, defaultChannelId, customChannelId, suggestionChannelId, githubRepo, statusTemplate }
      });

      // Aplica a presença e o status do bot INSTANTANEAMENTE no Discord
      const { updateBotPresence } = require('../utils/presenceManager');
      await updateBotPresence(client, guildId).catch(err => {
        console.warn('[GUILD_ROUTES] Erro ao aplicar presença instantânea:', err.message);
      });

      res.json({ success: true, config });
    } catch (err) {
      console.error('[GUILD_ROUTES] Erro ao salvar configurações:', err);
      res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
  });

  // Busca e puxa dados de um Embed existente pelo ID da Mensagem
  router.get('/api/guilds/:guildId/messages/:messageId', requireAuth, async (req, res) => {
    const { guildId, messageId } = req.params;
    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar este servidor.' });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'O bot não está nesse servidor.' });
      }

      const result = await MessageService.findMessageInGuild(guild, messageId);
      if (!result) {
        return res.status(404).json({ error: 'Mensagem não encontrada. Verifique se o ID está correto e se o bot tem acesso ao canal.' });
      }

      const parsedData = MessageService.parseMessageEmbedData(result.message, client);
      if (!parsedData) {
        return res.status(400).json({ error: 'A mensagem foi encontrada, mas não possui nenhum embed para ser editado.' });
      }

      return res.json({
        success: true,
        ...parsedData
      });
    } catch (err) {
      console.error('[GUILD_ROUTES] Erro ao buscar mensagem por ID:', err);
      return res.status(500).json({ error: `Erro ao buscar mensagem: ${err.message}` });
    }
  });

  return router;
}

module.exports = createGuildRouter;
