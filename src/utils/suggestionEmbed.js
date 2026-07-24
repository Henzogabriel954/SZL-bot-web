const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const prisma = require('../database');

/**
 * Gera uma barra de progresso visual para os votos.
 * @param {number} supportVotes - Quantidade de votos de apoio.
 * @param {number} totalVotes - Total de votos.
 * @param {number} length - Comprimento da barra de progresso.
 * @returns {string} Barra de progresso formatada em texto.
 */
function generateProgressBar(supportVotes, totalVotes, length = 12) {
  if (totalVotes === 0) {
    return '░'.repeat(length) + ' (0%)';
  }
  const percentage = (supportVotes / totalVotes) * 100;
  const progress = Math.round((supportVotes / totalVotes) * length);
  const emptyProgress = length - progress;
  const progressText = '█'.repeat(progress);
  const emptyProgressText = '░'.repeat(emptyProgress);
  return `\`${progressText}${emptyProgressText}\` (${percentage.toFixed(0)}%)`;
}

/**
 * Cria ou atualiza o Embed e os Componentes da sugestão.
 * @param {number} suggestionId - ID da sugestão no banco de dados.
 * @returns {Promise<{embeds: EmbedBuilder[], components: ActionRowBuilder[]}|null>} Retorna o embed e botões configurados.
 */
async function getSuggestionEmbedAndComponents(suggestionId) {
  const suggestion = await prisma.suggestion.findUnique({
    where: { id: suggestionId },
    include: { votes: true }
  });

  if (!suggestion) return null;

  const votes = suggestion.votes;
  const supportVotes = votes.filter(v => v.type === 'SUPPORT').length;
  const rejectVotes = votes.filter(v => v.type === 'REJECT').length;
  const totalVotes = votes.length;

  let color;
  let statusText;
  if (suggestion.status === 'APPROVED') {
    color = 0x2ECC71; // Verde (Aprovada/Implementada)
    statusText = '✅ **Aprovada pelo Painel Web**';
  } else if (suggestion.status === 'REJECTED') {
    color = 0xE74C3C; // Vermelho
    statusText = '❌ **Recusada pelo Painel Web**';
  } else {
    color = 0x9b59b6; // Roxo
    statusText = '⏳ **Em Discussão / Votação (Em Aberto)**';
  }

  const progressBar = generateProgressBar(supportVotes, totalVotes);

  const fields = [
    { name: '👤 Autor', value: `<@${suggestion.authorId}> (${suggestion.authorTag})`, inline: true },
    { name: '📌 Status', value: statusText, inline: true },
    { name: '📊 Votação dos Devs', value: `**Apoiar:** ${supportVotes} | **Recusar:** ${rejectVotes}\n${progressBar}` }
  ];

  if (suggestion.resolvedBy) {
    fields.push({ name: '🛡️ Moderador / Admin', value: suggestion.resolvedBy, inline: true });
  }
  if (suggestion.resolvedNotes) {
    fields.push({ name: '💬 Justificativa / Observação', value: suggestion.resolvedNotes, inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle(`💡 Proposta de Código / Sugestão #${suggestion.id}`)
    .setDescription(`\`\`\`markdown\n${suggestion.content}\n\`\`\``)
    .setColor(color)
    .addFields(fields)
    .setTimestamp(suggestion.createdAt)
    .setFooter({ text: 'SZL-BOT Devs • Painel de Sugestões' });

  const isPending = suggestion.status === 'PENDING';

  const btnSupport = new ButtonBuilder()
    .setCustomId(`vote_support_${suggestion.id}`)
    .setLabel(`Apoiar (${supportVotes})`)
    .setStyle(ButtonStyle.Success)
    .setEmoji('👍')
    .setDisabled(!isPending);

  const btnReject = new ButtonBuilder()
    .setCustomId(`vote_reject_${suggestion.id}`)
    .setLabel(`Recusar (${rejectVotes})`)
    .setStyle(ButtonStyle.Danger)
    .setEmoji('👎')
    .setDisabled(!isPending);

  const btnDiscuss = new ButtonBuilder()
    .setCustomId(`vote_discuss_${suggestion.id}`)
    .setLabel(suggestion.threadId ? 'Thread Ativa' : 'Discutir Código')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('💬')
    .setDisabled(!isPending);

  const row = new ActionRowBuilder().addComponents(btnSupport, btnReject, btnDiscuss);

  return { embeds: [embed], components: [row] };
}

module.exports = { getSuggestionEmbedAndComponents };
