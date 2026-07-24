/**
 * @file index.js
 * @description Ponto de entrada principal da aplicação SZL-BOT.
 * Inicializa o Cliente do Discord, banco de dados, carregadores de comandos/eventos e o servidor Express.
 */

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const path = require('path');
require('dotenv').config();

// Inicializa a conexão com o Banco de Dados Prisma
require('./src/database');

// Importa Utilitários Modulares
const { loadCommands } = require('./src/utils/commandLoader');
const { loadEvents } = require('./src/utils/eventLoader');
const { startServer } = require('./src/server');

// Instancia o cliente com as intenções necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Coleção para armazenar os Comandos de Barra (Slash Commands)
client.commands = new Collection();

// Carrega os comandos e eventos dinamicamente
loadCommands(client, path.join(__dirname, 'src', 'commands'));
loadEvents(client, path.join(__dirname, 'src', 'events'));

// Validação do Token do Discord
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ [FATAL] Erro: DISCORD_TOKEN não está definido no arquivo .env.');
  process.exit(1);
}

// Inicia o Servidor do Dashboard quando o bot estiver pronto ('ready' no discord.js v14)
client.once('ready', () => {
  startServer(client);
});

// Manipulador de erros globais para evitar exceções não tratadas
process.on('unhandledRejection', error => {
  console.error('⚠️ [ERRO GLOBAL] Exceção não tratada:', error);
});

process.on('uncaughtException', error => {
  console.error('⚠️ [ERRO GLOBAL] Exceção não capturada:', error);
});

// Encerramento gracioso do bot e banco de dados
const prisma = require('./src/database');
async function handleShutdown(signal) {
  console.log(`\n🛑 [SHUTDOWN] Recebido sinal ${signal}. Encerrando conexões...`);
  try {
    if (client) client.destroy();
    if (prisma) await prisma.$disconnect();
    console.log('✅ Connections closed gracefully.');
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Realiza o login na API do Discord
client.login(process.env.DISCORD_TOKEN);

