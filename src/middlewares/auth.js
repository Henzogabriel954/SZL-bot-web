/**
 * @file src/middlewares/auth.js
 * @description Middleware de autenticação e verificação de permissões para o Dashboard Express.
 * @module middlewares/auth
 */

/**
 * Middleware para garantir que a requisição venha de um usuário autenticado.
 * Retorna status 401 (Não Autorizado) caso não haja sessão ativa.
 *
 * @param {import('express').Request} req - Objeto de requisição do Express.
 * @param {import('express').Response} res - Objeto de resposta do Express.
 * @param {import('express').NextFunction} next - Função de callback para o próximo middleware.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Acesso negado. Faça login primeiro.' });
  }
  next();
}

/**
 * Verifica se o usuário autenticado tem permissão administrativa para a guilda especificada.
 *
 * @param {import('express').Request} req - Objeto de requisição do Express contendo as guildas do usuário na sessão.
 * @param {string} guildId - ID da guilda do Discord a ser verificada.
 * @returns {boolean} True se o usuário tiver permissão de administrador na guilda.
 */
function isUserGuildAdmin(req, guildId) {
  const userGuilds = req.session?.guilds || [];
  return userGuilds.some(g => g.id === guildId);
}

module.exports = {
  requireAuth,
  isUserGuildAdmin
};
