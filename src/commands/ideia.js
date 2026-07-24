const { SlashCommandBuilder } = require('discord.js');
const prisma = require('../database');
const { getSuggestionEmbedAndComponents } = require('../utils/suggestionEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ideia')
    .setDescription('Envia uma ideia/proposta de código para o canal de sugestões.')
    .addStringOption(option =>
      option.setName('conteudo')
        .setDescription('Descreva detalhadamente a sua ideia ou sugestão.')
        .setRequired(true)
        .setMaxLength(1024)
    ),
  async execute(interaction) {
    let channelId = process.env.SUGGESTION_CHANNEL_ID;
    if (interaction.guildId) {
      const guildConfig = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guildId }
      });
      if (guildConfig && guildConfig.suggestionChannelId) {
        channelId = guildConfig.suggestionChannelId;
      }
    }

    if (!channelId) {
      return interaction.reply({
        content: '❌ O canal de sugestões não foi configurado no painel do servidor ou no arquivo `.env`.',
        ephemeral: true
      });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return interaction.reply({
        content: '❌ Canal de sugestões configurado não foi encontrado ou o bot não tem permissão para vê-lo.',
        ephemeral: true
      });
    }

    const conteudo = interaction.options.getString('conteudo');

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Cria a sugestão no banco de dados para obter o ID
      const suggestion = await prisma.suggestion.create({
        data: {
          authorId: interaction.user.id,
          authorTag: interaction.user.tag,
          content: conteudo,
          status: 'PENDING'
        }
      });

      // 2. Busca o embed estruturado e os botões
      const payload = await getSuggestionEmbedAndComponents(suggestion.id);
      if (!payload) {
        throw new Error('Falha ao gerar o payload do embed.');
      }

      // 3. Envia para o canal de sugestões
      const message = await channel.send({
        embeds: payload.embeds,
        components: payload.components
      });

      // 4. Salva o ID da mensagem e do canal no registro da sugestão
      await prisma.suggestion.update({
        where: { id: suggestion.id },
        data: {
          messageId: message.id,
          channelId: channel.id
        }
      });

      await interaction.editReply({
        content: `✅ Sua sugestão/proposta foi enviada com sucesso no canal <#${channel.id}>! ID: **#${suggestion.id}**`
      });
    } catch (error) {
      console.error('Erro ao processar comando de sugestão:', error);
      await interaction.editReply({
        content: '❌ Ocorreu um erro interno ao processar e enviar sua sugestão no banco de dados.'
      });
    }
  }
};
