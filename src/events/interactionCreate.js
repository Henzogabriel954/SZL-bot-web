const prisma = require('../database');
const { getSuggestionEmbedAndComponents } = require('../utils/suggestionEmbed');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // 1. Tratamento de Comandos de Barra (/)
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Erro ao executar o comando ${interaction.commandName}:`, error);
        const replyPayload = { content: '❌ Ocorreu um erro ao executar este comando!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload);
        } else {
          await interaction.reply(replyPayload);
        }
      }
      return;
    }

    // 2. Tratamento de Cliques em Botões
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId.startsWith('vote_')) {
        const parts = customId.split('_'); // ['vote', 'support'/'reject'/'discuss', 'suggestionId']
        const actionType = parts[1]; // 'support', 'reject' ou 'discuss'
        const suggestionId = parseInt(parts[2]);
        const userId = interaction.user.id;

        const suggestion = await prisma.suggestion.findUnique({
          where: { id: suggestionId }
        });

        if (suggestion && suggestion.status !== 'PENDING') {
          return interaction.reply({
            content: '❌ Esta sugestão/proposta já foi avaliada e finalizada pelo painel web. Votações encerradas!',
            ephemeral: true
          });
        }

        if (actionType === 'discuss') {
          await interaction.deferReply({ ephemeral: true });
          
          try {
            if (!suggestion) {
              return interaction.editReply({ content: '❌ Sugestão não encontrada no banco de dados.' });
            }

            if (suggestion.threadId) {
              return interaction.editReply({
                content: `💬 O debate para esta sugestão já está ativo! Participe aqui: <#${suggestion.threadId}>`
              });
            }

            // Cria a thread vinculada à mensagem da sugestão
            const message = interaction.message;
            const thread = await message.startThread({
              name: `💻 Discussão - Proposta #${suggestion.id}`,
              autoArchiveDuration: 1440 // 24 horas
            });

            await thread.send(`Bem-vindo ao canal de debate sobre a sugestão/proposta **#${suggestion.id}** de <@${suggestion.authorId}>!\n\n**Proposta:** "${suggestion.content}"`);

            // Salva o ID da thread no banco
            await prisma.suggestion.update({
              where: { id: suggestion.id },
              data: { threadId: thread.id }
            });

            // Atualiza os componentes da mensagem original
            const payload = await getSuggestionEmbedAndComponents(suggestion.id);
            if (payload) {
              await message.edit({
                embeds: payload.embeds,
                components: payload.components
              });
            }

            return interaction.editReply({
              content: `✅ Discussão iniciada! Participe do debate aqui: <#${thread.id}>`
            });
          } catch (err) {
            console.error('Erro ao abrir discussão:', err);
            return interaction.editReply({
              content: '❌ Ocorreu um erro ao tentar abrir a thread de discussão.'
            });
          }
        }

        const voteType = actionType === 'support' ? 'SUPPORT' : 'REJECT';

        // Adia a resposta para atualizar a mensagem original de forma limpa
        await interaction.deferUpdate();

        try {
          // Busca se o usuário já votou nesta sugestão
          const existingVote = await prisma.vote.findUnique({
            where: {
              suggestionId_userId: {
                suggestionId,
                userId
              }
            }
          });

          let replyText = '';

          if (existingVote) {
            if (existingVote.type === voteType) {
              // Se clicou no mesmo botão que já havia votado, remove o voto (toggle off)
              await prisma.vote.delete({
                where: { id: existingVote.id }
              });
              replyText = 'Você retirou o seu voto.';
            } else {
              // Se clicou no botão oposto, atualiza o tipo do voto
              await prisma.vote.update({
                where: { id: existingVote.id },
                data: { type: voteType }
              });
              replyText = `Você mudou seu voto para **${voteType === 'SUPPORT' ? 'Apoiar' : 'Recusar'}**.`;
            }
          } else {
            // Se ainda não votou, insere o novo voto
            await prisma.vote.create({
              data: {
                suggestionId,
                userId,
                type: voteType
              }
            });
            replyText = `Você votou para **${voteType === 'SUPPORT' ? 'Apoiar' : 'Recusar'}**.`;
          }

          // Atualiza a mensagem com o embed e contagens atualizadas
          const payload = await getSuggestionEmbedAndComponents(suggestionId);
          if (payload) {
            await interaction.editReply({
              embeds: payload.embeds,
              components: payload.components
            });

            // Envia uma mensagem efêmera confirmando a ação do usuário
            await interaction.followUp({
              content: `✅ ${replyText}`,
              ephemeral: true
            });
          }
        } catch (error) {
          console.error('Erro ao registrar voto:', error);
          await interaction.followUp({
            content: '❌ Ocorreu um erro ao computar seu voto.',
            ephemeral: true
          });
        }
      }
      return;
    }
  }
};
