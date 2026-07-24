const { Events } = require('discord.js');
const { updateBotPresence } = require('../utils/presenceManager');

module.exports = {
  name: Events.ClientReady || 'ready',
  once: true,
  execute(client) {
    console.log(`🚀 Bot online! Logado com sucesso como ${client.user.tag}`);
    
    // Executa imediatamente e agenda a cada 1 minuto (60000 ms)
    updateBotPresence(client);
    setInterval(() => updateBotPresence(client), 60000);
  }
};

