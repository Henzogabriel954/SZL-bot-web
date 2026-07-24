/**
 * @file src/services/announcementService.js
 * @description Serviço responsável pela montagem de Embeds e Botões (ActionRow) do Discord.
 * @module services/announcementService
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * @typedef {Object} EmbedFieldPayload
 * @property {string} name - Título do campo.
 * @property {string} value - Conteúdo/Valor do campo.
 * @property {boolean} [inline] - Se o campo deve ser exibido em formato inline (lado a lado).
 */

/**
 * @typedef {Object} LinkButtonPayload
 * @property {string} label - Texto visível do botão.
 * @property {string} url - Link de destino (HTTP/HTTPS).
 */

/**
 * @typedef {Object} AnnouncementPayload
 * @property {string} [title] - Título principal do embed.
 * @property {string} [description] - Corpo/Descrição da mensagem.
 * @property {string} [color] - Cor em formato hexadecimal (#RRGGBB).
 * @property {string} [imageUrl] - URL da imagem grande (corpo do embed).
 * @property {string} [thumbnailUrl] - URL do ícone pequeno (miniatura no canto superior).
 * @property {string} [footer] - Texto para exibir no rodapé do embed.
 * @property {EmbedFieldPayload[]} [fields] - Lista de campos adicionais.
 * @property {LinkButtonPayload[]} [buttons] - Lista de botões de link externo.
 */

class AnnouncementService {
  /**
   * Constrói um objeto EmbedBuilder pré-configurado a partir do payload fornecido.
   * Adiciona o timestamp automático de envio/edição.
   *
   * @param {AnnouncementPayload} payload - Objeto com os dados do anúncio.
   * @returns {EmbedBuilder} Instância configurada do EmbedBuilder.
   */
  static buildEmbed(payload) {
    const { title, description, color, imageUrl, thumbnailUrl, footer, fields } = payload;
    const embed = new EmbedBuilder();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);

    if (color) {
      const cleanColor = String(color).replace('#', '0x');
      const parsedColor = parseInt(cleanColor, 16);
      embed.setColor(!isNaN(parsedColor) ? parsedColor : 0x5865F2);
    } else {
      embed.setColor(0x5865F2);
    }

    const isValidUrl = (urlStr) => {
      try {
        const u = new URL(urlStr);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    };

    if (imageUrl && isValidUrl(imageUrl)) embed.setImage(imageUrl);
    if (thumbnailUrl && isValidUrl(thumbnailUrl)) embed.setThumbnail(thumbnailUrl);
    if (footer) embed.setFooter({ text: footer });

    // Adiciona timestamp no rodapé automaticamente (hora de envio/edição)
    embed.setTimestamp();

    if (fields && Array.isArray(fields)) {
      fields.forEach(f => {
        if (f.name && f.value) {
          embed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
        }
      });
    }

    return embed;
  }

  /**
   * Constrói componentes ActionRow contendo Botões de Link (ButtonStyle.Link) a partir da lista fornecida.
   *
   * @param {LinkButtonPayload[]} [buttons] - Lista de botões de link.
   * @returns {ActionRowBuilder[]} Array de ActionRowBuilder contendo os botões (máximo 5 por linha).
   */
  static buildComponents(buttons) {
    const components = [];
    if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
      return components;
    }

    const row = new ActionRowBuilder();
    buttons.forEach(b => {
      if (b.label && b.url) {
        try {
          row.addComponents(
            new ButtonBuilder()
              .setLabel(b.label)
              .setStyle(ButtonStyle.Link)
              .setUrl(b.url)
          );
        } catch (err) {
          console.warn(`[ANNOUNCEMENT_SERVICE] Falha ao criar botão "${b.label}": ${err.message}`);
        }
      }
    });

    if (row.components.length > 0) {
      components.push(row);
    }

    return components;
  }
}

module.exports = AnnouncementService;
