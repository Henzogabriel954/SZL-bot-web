/**
 * @file src/routes/announcementRoutes.js
 * @description Rotas da API Express para envio e edição de avisos e embeds no Discord.
 * @module routes/announcementRoutes
 */

const express = require('express');
const { ChannelType } = require('discord.js');
const { requireAuth, isUserGuildAdmin } = require('../middlewares/auth');
const AnnouncementService = require('../services/announcementService');

/**
 * Cria o Router de Avisos e Anúncios do Express.
 *
 * @param {import('discord.js').Client} client - Cliente do Bot do Discord.
 * @returns {express.Router} Router do Express com as rotas de avisos.
 */
function createAnnouncementRouter(client) {
  const router = express.Router();

  // Rota de Envio de Novo Aviso
  router.post('/api/announcements', requireAuth, async (req, res) => {
    const { 
      guildId, 
      channelId, 
      additionalChannelId, 
      title, 
      description, 
      color, 
      imageUrl, 
      thumbnailUrl, 
      footer, 
      fields,
      buttons,
      roleId 
    } = req.body;

    if (!guildId) {
      return res.status(400).json({ error: 'ID do servidor é obrigatório.' });
    }

    if (!channelId && !additionalChannelId) {
      return res.status(400).json({ error: 'Ao menos um canal de destino deve ser definido.' });
    }

    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Você não tem permissão para enviar avisos neste servidor.' });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'O bot não está mais nesse servidor.' });
      }

      // Monta a menção do cargo (content da mensagem)
      let messageContent = null;
      if (roleId) {
        if (roleId === '@everyone') messageContent = '@everyone';
        else if (roleId === '@here') messageContent = '@here';
        else if (roleId.trim()) messageContent = `<@&${roleId.trim()}>`;
      }

      // Monta o Embed e Componentes (Botões de Link)
      const embed = AnnouncementService.buildEmbed({ title, description, color, imageUrl, thumbnailUrl, footer, fields });
      const components = AnnouncementService.buildComponents(buttons);

      let sentCount = 0;

      // Envia para o canal principal (Canal de Texto, Anúncios ou Thread)
      if (channelId) {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          await channel.send({ embeds: [embed], components });
          if (messageContent) {
            await channel.send({ content: messageContent });
          }
          sentCount++;
        }
      }

      // Envia para o canal adicional (Canal de Texto, Anúncios ou Thread)
      if (additionalChannelId) {
        const addChannel = await guild.channels.fetch(additionalChannelId).catch(() => null);
        if (addChannel && addChannel.isTextBased()) {
          await addChannel.send({ embeds: [embed], components });
          if (messageContent) {
            await addChannel.send({ content: messageContent });
          }
          sentCount++;
        }
      }

      if (sentCount === 0) {
        return res.status(400).json({ error: 'Nenhum canal válido de destino foi encontrado para receber o aviso.' });
      }

      return res.json({ success: true, message: `Aviso enviado com sucesso em ${sentCount} canal(is)!` });
    } catch (err) {
      console.error('[ANNOUNCEMENT_ROUTES] Erro ao enviar aviso:', err);
      return res.status(500).json({ error: `Falha ao enviar aviso: ${err.message}` });
    }
  });

  // Rota de Edição de Embed Existente
  router.put('/api/announcements', requireAuth, async (req, res) => {
    const { 
      guildId, 
      channelId, 
      messageId, 
      title, 
      description, 
      color, 
      imageUrl, 
      thumbnailUrl, 
      footer, 
      fields,
      buttons,
      roleId 
    } = req.body;

    if (!guildId || !channelId || !messageId) {
      return res.status(400).json({ error: 'IDs de servidor, canal e mensagem são obrigatórios.' });
    }

    if (!isUserGuildAdmin(req, guildId)) {
      return res.status(403).json({ error: 'Você não tem permissão para editar avisos neste servidor.' });
    }

    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'O bot não está mais nesse servidor.' });
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return res.status(404).json({ error: 'Canal da mensagem não encontrado.' });
      }

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        return res.status(404).json({ error: 'Mensagem não encontrada no canal.' });
      }

      if (message.author?.id !== client.user?.id) {
        return res.status(403).json({ error: 'O bot só pode editar mensagens que foram enviadas por ele mesmo.' });
      }

      // Monta a menção do cargo (content da mensagem)
      let messageContent = null;
      if (roleId) {
        if (roleId === '@everyone') messageContent = '@everyone';
        else if (roleId === '@here') messageContent = '@here';
        else if (roleId.trim()) messageContent = `<@&${roleId.trim()}>`;
      }

      // Monta o Embed atualizado e Componentes
      const embed = AnnouncementService.buildEmbed({ title, description, color, imageUrl, thumbnailUrl, footer, fields });
      const components = AnnouncementService.buildComponents(buttons);

      // Atualiza a mensagem principal do embed
      await message.edit({ content: null, embeds: [embed], components });

      // Se houver um cargo a ser mencionado, envia em uma mensagem logo abaixo
      if (messageContent) {
        await channel.send({ content: messageContent });
      }

      return res.json({ success: true, message: `Mensagem editada com sucesso no canal #${channel.name}!` });
    } catch (err) {
      console.error('[ANNOUNCEMENT_ROUTES] Erro ao editar mensagem:', err);
      return res.status(500).json({ error: `Falha ao editar mensagem: ${err.message}` });
    }
  });

  return router;
}

module.exports = createAnnouncementRouter;
