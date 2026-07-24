/**
 * @file src/routes/suggestionRoutes.js
 * @description Rotas de API Express para gerenciamento de sugestões (listagem, aprovação e rejeição pelo site).
 * @module routes/suggestionRoutes
 */

const express = require('express');
const prisma = require('../database');
const { getSuggestionEmbedAndComponents } = require('../utils/suggestionEmbed');
const { requireAuth } = require('../middlewares/auth');

function createSuggestionRouter(client) {
  const router = express.Router();

  // Helper para atualizar a mensagem do Discord
  async function syncDiscordMessage(suggestionId) {
    try {
      const suggestion = await prisma.suggestion.findUnique({
        where: { id: suggestionId }
      });
      if (!suggestion || !suggestion.messageId) return false;

      const channelId = suggestion.channelId || process.env.SUGGESTION_CHANNEL_ID;
      if (!channelId) return false;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return false;

      const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
      if (!message) return false;

      const payload = await getSuggestionEmbedAndComponents(suggestionId);
      if (!payload) return false;

      await message.edit({
        embeds: payload.embeds,
        components: payload.components
      });

      // Se a sugestão foi finalizada (Aprovada/Rejeitada) e tem uma thread de discussão, tranca a thread.
      if (suggestion.status !== 'PENDING' && suggestion.threadId) {
        try {
          const thread = await channel.threads.fetch(suggestion.threadId).catch(() => null);
          if (thread && !thread.locked) {
            await thread.send(`🔒 Esta ideia foi avaliada e finalizada. O tópico foi fechado e bloqueado para novas mensagens, mas ficará visível para leitura.`);
            await thread.setLocked(true);
            await thread.setArchived(true);
          }
        } catch (threadErr) {
          console.error(`Erro ao fechar a thread da sugestão ${suggestionId}:`, threadErr);
        }
      }

      return true;
    } catch (err) {
      console.error(`[SUGGESTIONS_ROUTES] Erro ao sincronizar mensagem ${suggestionId} no Discord:`, err);
      return false;
    }
  }

  // GET /api/suggestions - Listagem de sugestões com suporte a filtro por status
  router.get('/api/suggestions', requireAuth, async (req, res) => {
    try {
      const statusFilter = (req.query.status || 'PENDING').toUpperCase();
      let where = {};

      if (statusFilter !== 'ALL') {
        where.status = statusFilter;
      }

      const suggestions = await prisma.suggestion.findMany({
        where,
        include: { votes: true },
        orderBy: { createdAt: 'desc' }
      });

      const formatted = suggestions.map(s => {
        const supportCount = s.votes.filter(v => v.type === 'SUPPORT').length;
        const rejectCount = s.votes.filter(v => v.type === 'REJECT').length;
        return {
          id: s.id,
          authorId: s.authorId,
          authorTag: s.authorTag,
          content: s.content,
          messageId: s.messageId,
          channelId: s.channelId,
          status: s.status,
          threadId: s.threadId,
          resolvedBy: s.resolvedBy,
          resolvedNotes: s.resolvedNotes,
          resolvedAt: s.resolvedAt,
          createdAt: s.createdAt,
          supportCount,
          rejectCount,
          totalVotes: s.votes.length
        };
      });

      res.json({ success: true, suggestions: formatted });
    } catch (err) {
      console.error('[SUGGESTIONS_ROUTES] Erro ao listar sugestões:', err);
      res.status(500).json({ success: false, error: 'Erro ao buscar sugestões.' });
    }
  });

  // GET /api/suggestions/stats - Estatísticas gerais para o painel web
  router.get('/api/suggestions/stats', requireAuth, async (req, res) => {
    try {
      const pendingCount = await prisma.suggestion.count({ where: { status: 'PENDING' } });
      const approvedCount = await prisma.suggestion.count({ where: { status: 'APPROVED' } });
      const rejectedCount = await prisma.suggestion.count({ where: { status: 'REJECTED' } });
      const totalCount = await prisma.suggestion.count();
      const totalVotes = await prisma.vote.count();

      res.json({
        success: true,
        stats: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
          total: totalCount,
          totalVotes
        }
      });
    } catch (err) {
      console.error('[SUGGESTIONS_ROUTES] Erro ao obter estatísticas:', err);
      res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas.' });
    }
  });

  // POST /api/suggestions/:id/approve - Aprovar sugestão pelo site
  router.post('/api/suggestions/:id/approve', requireAuth, async (req, res) => {
    try {
      const suggestionId = parseInt(req.params.id, 10);
      const { adminNotes } = req.body;
      const adminName = req.session?.user?.username || req.body.adminName || 'Administrador';

      const updated = await prisma.suggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'APPROVED',
          resolvedBy: adminName,
          resolvedNotes: adminNotes || '',
          resolvedAt: new Date()
        }
      });

      // Sincroniza o embed no Discord
      await syncDiscordMessage(suggestionId);

      res.json({ success: true, suggestion: updated });
    } catch (err) {
      console.error('[SUGGESTIONS_ROUTES] Erro ao aprovar sugestão:', err);
      res.status(500).json({ success: false, error: 'Erro ao aprovar sugestão.' });
    }
  });

  // POST /api/suggestions/:id/reject - Rejeitar sugestão pelo site
  router.post('/api/suggestions/:id/reject', requireAuth, async (req, res) => {
    try {
      const suggestionId = parseInt(req.params.id, 10);
      const { adminNotes } = req.body;
      const adminName = req.session?.user?.username || req.body.adminName || 'Administrador';

      const updated = await prisma.suggestion.update({
        where: { id: suggestionId },
        data: {
          status: 'REJECTED',
          resolvedBy: adminName,
          resolvedNotes: adminNotes || '',
          resolvedAt: new Date()
        }
      });

      // Sincroniza o embed no Discord
      await syncDiscordMessage(suggestionId);

      res.json({ success: true, suggestion: updated });
    } catch (err) {
      console.error('[SUGGESTIONS_ROUTES] Erro ao rejeitar sugestão:', err);
      res.status(500).json({ success: false, error: 'Erro ao rejeitar sugestão.' });
    }
  });

  return router;
}

module.exports = createSuggestionRouter;
