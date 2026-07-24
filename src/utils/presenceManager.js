/**
 * @file src/utils/presenceManager.js
 * @description Gerenciador centralizado de presença e status do Bot do Discord.
 * Aplica status instantaneamente (online, idle, dnd, invisible) e mantém atualização cíclica.
 * @module utils/presenceManager
 */

const { ActivityType } = require('discord.js');
const axios = require('axios');
const prisma = require('../database');

// Status padrão da comunidade de dev
const defaultStatuses = [
  { name: 'Escrevendo código limpo 🚀', type: ActivityType.Playing },
  { name: 'Corrigindo bugs no código 🐛', type: ActivityType.Playing },
  { name: 'Ajudando desenvolvedores 💻', type: ActivityType.Watching },
  { name: 'Refatorando infraestrutura ⚙️', type: ActivityType.Custom },
  { name: 'Lendo documentação 📚', type: ActivityType.Playing },
  { name: 'Revisando Pull Requests 🔍', type: ActivityType.Watching }
];

let cycleIndex = 0;

/**
 * Atualiza a presença do bot (status e atividades) no Discord.
 * Pode ser chamado instantaneamente na salvação de configurações ou pelo ciclo automático.
 *
 * @param {import('discord.js').Client} client - Instância do Cliente do Discord.
 * @param {string|null} [targetGuildId=null] - ID opcional da guilda para forçar o status salvo.
 */
async function updateBotPresence(client, targetGuildId = null) {
  if (!client || !client.user) return;

  try {
    // 1. Busca todas as configurações de servidores gravadas no banco de dados
    const configs = await prisma.guildConfig.findMany();

    // Determina o status ativo (online, idle, dnd, invisible)
    let activeStatus = 'online';

    if (targetGuildId) {
      const targetConfig = configs.find(c => c.guildId === targetGuildId);
      if (targetConfig?.statusTemplate) {
        activeStatus = targetConfig.statusTemplate;
      }
    }

    if (activeStatus === 'online') {
      const configWithStatus = configs.find(c => c.statusTemplate && c.statusTemplate !== 'online');
      if (configWithStatus) {
        activeStatus = configWithStatus.statusTemplate;
      } else if (configs.length > 0 && configs[0].statusTemplate) {
        activeStatus = configs[0].statusTemplate;
      }
    }

    // 2. Filtra servidores que possuem repositórios do GitHub cadastrados
    const configsWithRepo = configs.filter(c => c.githubRepo && c.githubRepo.trim() !== '');

    if (configsWithRepo.length === 0) {
      const statusObj = defaultStatuses[cycleIndex % defaultStatuses.length];
      cycleIndex++;

      client.user.setPresence({
        activities: [{ name: statusObj.name, type: statusObj.type }],
        status: activeStatus
      });
      return;
    }

    // Seleciona o repositório do ciclo
    const config = configsWithRepo[cycleIndex % configsWithRepo.length];
    cycleIndex++;

    if (config.statusTemplate) {
      activeStatus = config.statusTemplate;
    }

    const repo = config.githubRepo;
    const headers = { 'User-Agent': 'SZL-BOT-Discord-Agent' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    try {
      const response = await axios.get(`https://api.github.com/repos/${repo}`, { headers, timeout: 5000 });
      const data = response.data;

      if (data) {
        client.user.setPresence({
          activities: [{
            name: `⭐ ${data.name}: ${data.stargazers_count} stars | 🐛 ${data.open_issues_count} issues`,
            type: ActivityType.Watching
          }],
          status: activeStatus
        });
      }
    } catch {
      client.user.setPresence({
        activities: [{ name: `💻 GitHub: ${repo}`, type: ActivityType.Watching }],
        status: activeStatus
      });
    }

  } catch (error) {
    console.error('[PRESENCE] Erro ao atualizar presença do bot:', error.message);
    try {
      client.user.setPresence({
        activities: [{ name: 'escrever código 💻', type: ActivityType.Playing }],
        status: 'online'
      });
    } catch {}
  }
}

module.exports = { updateBotPresence };
