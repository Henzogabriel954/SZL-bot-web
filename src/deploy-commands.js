const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Erro: DISCORD_TOKEN não está definido no arquivo .env.');
  process.exit(1);
}

// Obtém o Client ID das variáveis de ambiente ou decodifica do Token do Discord
let clientId = process.env.CLIENT_ID;
if (!clientId) {
  try {
    const base64ClientId = token.split('.')[0];
    clientId = Buffer.from(base64ClientId, 'base64').toString('utf-8');
    if (isNaN(clientId)) {
      throw new Error('ID decodificado não é numérico.');
    }
    console.log(`🤖 Client ID decodificado automaticamente do Token: ${clientId}`);
  } catch (error) {
    console.error('❌ Erro: Falha ao extrair automaticamente o Client ID a partir do token. Verifique se o DISCORD_TOKEN é válido ou defina CLIENT_ID no .env.');
    process.exit(1);
  }
} else {
  console.log(`🤖 Usando Client ID do arquivo .env: ${clientId}`);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      console.warn(`[AVISO] O comando em ${filePath} está sem a propriedade "data" ou "execute".`);
    }
  }
} else {
  console.error('❌ Erro: A pasta src/commands não existe.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);
const guildIds = process.env.GUILD_ID ? process.env.GUILD_ID.split(',').map(id => id.trim()) : [];

(async () => {
  try {
    if (guildIds.length > 0) {
      console.log(`⚡ Iniciando o registro de ${commands.length} comando(s) para ${guildIds.length} guilda(s) configurada(s)...`);

      for (const id of guildIds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(clientId, id),
            { body: commands },
          );
          console.log(`✅ Comandos registrados instantaneamente na guilda ID: ${id}`);
        } catch (guildErr) {
          console.error(`❌ Erro ao registrar comandos na guilda ID: ${id}:`, guildErr.message);
        }
      }
      console.log(`✅ Registro em servidores concluído!`);
    } else {
      console.log(`🌍 Iniciando o registro de ${commands.length} comando(s) globais (pode levar até 1 hora para sincronizar)...`);

      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );

      console.log(`✅ Sucesso: ${data.length} comandos de barra (/) registrados globalmente!`);
    }
  } catch (error) {
    console.error('❌ Erro geral ao registrar os comandos:', error);
  }
})();
