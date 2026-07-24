/**
 * @file src/services/messageService.js
 * @description Serviço para busca, extração e edição de mensagens e embeds existentes no Discord.
 * @module services/messageService
 */

const { ChannelType } = require('discord.js');
const prisma = require('../database');

// Cache em memória para guardar o ID do canal onde uma mensagem foi encontrada/enviada
const messageChannelCache = new Map();

class MessageService {
  /**
   * Guarda o mapeamento ID de Mensagem -> ID de Canal para agilizar buscas futuras.
   */
  static cacheMessageLocation(messageId, channelId) {
    if (messageId && channelId) {
      messageChannelCache.set(messageId, channelId);
      // Limita tamanho do cache em memória a 500 itens
      if (messageChannelCache.size > 500) {
        const firstKey = messageChannelCache.keys().next().value;
        messageChannelCache.delete(firstKey);
      }
    }
  }

  /**
   * Busca uma mensagem pelo ID em uma guilda do Discord.
   * Otimiza a busca usando cache de localização e verificando canais salvos.
   *
   * @param {import('discord.js').Guild} guild - Instância da guilda do Discord.
   * @param {string} messageId - ID da mensagem a ser buscada.
   * @returns {Promise<{ message: import('discord.js').Message, channel: import('discord.js').TextChannel } | null>} Objeto com a mensagem e o canal encontrados, ou null.
   */
  static async findMessageInGuild(guild, messageId) {
    // 0. Verifica se o canal dessa mensagem já está no cache em memória (Ultra rápido ~0ms)
    const cachedChannelId = messageChannelCache.get(messageId);
    if (cachedChannelId) {
      let chan = guild.channels.cache.get(cachedChannelId);
      if (!chan) chan = await guild.channels.fetch(cachedChannelId).catch(() => null);
      if (chan && chan.isTextBased()) {
        const msg = await chan.messages.fetch(messageId).catch(() => null);
        if (msg) return { message: msg, channel: chan };
      }
    }

    // 1. Busca os canais configurados salvos no banco
    const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } }).catch(() => null);
    const targetChannelIds = [];
    if (config?.defaultChannelId) targetChannelIds.push(config.defaultChannelId);
    if (config?.customChannelId) targetChannelIds.push(config.customChannelId);

    // Tenta buscar nos canais salvos
    for (const chanId of targetChannelIds) {
      let chan = guild.channels.cache.get(chanId);
      if (!chan) chan = await guild.channels.fetch(chanId).catch(() => null);
      if (chan && chan.isTextBased()) {
        const msg = await chan.messages.fetch(messageId).catch(() => null);
        if (msg) {
          MessageService.cacheMessageLocation(messageId, chan.id);
          return { message: msg, channel: chan };
        }
      }
    }

    // 2. Se não encontrou, busca em paralelo em todos os demais canais de texto e threads da guilda
    const textChannels = Array.from(
      guild.channels.cache.filter(
        c => c.isTextBased() && !targetChannelIds.includes(c.id)
      ).values()
    );

    // Processa em lotes paralelos de 10 canais para performance máxima
    const BATCH_SIZE = 10;
    for (let i = 0; i < textChannels.length; i += BATCH_SIZE) {
      const batch = textChannels.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async chan => {
          const msg = await chan.messages.fetch(messageId).catch(() => null);
          return msg ? { message: msg, channel: chan } : null;
        })
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          MessageService.cacheMessageLocation(messageId, res.value.channel.id);
          return res.value;
        }
      }
    }

    return null;
  }

  /**
   * Extrai dados de embed e botões de link de uma mensagem do Discord.
   *
   * @param {import('discord.js').Message} message - Instância da mensagem do Discord.
   * @param {import('discord.js').Client} client - Cliente do Bot para checagem de autor.
   * @returns {Object} Dados estruturados do Embed e Botões para o formulário no frontend.
   */
  static parseMessageEmbedData(message, client) {
    if (!message.embeds || message.embeds.length === 0) {
      return null;
    }

    const embed = message.embeds[0];

    // Formata a cor em Hexadecimal (#RRGGBB)
    let hexColor = '#6366f1';
    if (embed.hexColor && embed.hexColor !== '#000000') {
      hexColor = embed.hexColor;
    } else if (embed.color) {
      hexColor = '#' + embed.color.toString(16).padStart(6, '0');
    }

    // Extrai o roleId do message.content se houver menção a cargo ou everyone/here
    let roleId = '';
    if (message.content) {
      if (message.content.includes('@everyone')) {
        roleId = '@everyone';
      } else if (message.content.includes('@here')) {
        roleId = '@here';
      } else {
        const match = message.content.match(/<@&(\d+)>/);
        if (match) {
          roleId = match[1];
        }
      }
    }

    // Extrai botões de link da ActionRow se existirem
    const buttons = [];
    if (message.components && message.components.length > 0) {
      message.components.forEach(row => {
        if (row.components && Array.isArray(row.components)) {
          row.components.forEach(comp => {
            if (comp.url && comp.label) {
              buttons.push({ label: comp.label, url: comp.url });
            }
          });
        }
      });
    }

    return {
      messageId: message.id,
      channelId: message.channel.id,
      channelName: message.channel.name,
      isAuthor: message.author?.id === client.user?.id,
      roleId,
      embed: {
        title: embed.title || '',
        description: embed.description || '',
        color: hexColor,
        thumbnailUrl: embed.thumbnail?.url || '',
        imageUrl: embed.image?.url || '',
        footer: embed.footer?.text || '',
        fields: embed.fields ? embed.fields.map(f => ({ name: f.name, value: f.value, inline: !!f.inline })) : [],
        buttons
      }
    };
  }
}

module.exports = MessageService;
