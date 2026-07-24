/**
 * @file src/utils/commandLoader.js
 * @description Utilitário para carregamento dinâmico de Comandos de Barra (Slash Commands).
 * @module utils/commandLoader
 */

const fs = require('fs');
const path = require('path');

/**
 * Carrega todos os comandos .js presentes na pasta especificada e registra na Coleção do Client.
 *
 * @param {import('discord.js').Client} client - Instância do Cliente do Discord.
 * @param {string} commandsDirPath - Caminho absoluto para a pasta de comandos.
 */
function loadCommands(client, commandsDirPath) {
  if (!fs.existsSync(commandsDirPath)) {
    console.warn(`[COMMAND_LOADER] Pasta de comandos não encontrada: ${commandsDirPath}`);
    return;
  }

  const commandFiles = fs.readdirSync(commandsDirPath).filter(file => file.endsWith('.js'));
  let loadedCount = 0;

  for (const file of commandFiles) {
    const filePath = path.join(commandsDirPath, file);
    try {
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        loadedCount++;
      } else {
        console.warn(`[COMMAND_LOADER] O comando em ${filePath} está sem a propriedade "data" ou "execute".`);
      }
    } catch (err) {
      console.error(`[COMMAND_LOADER] Erro ao carregar o comando ${filePath}:`, err);
    }
  }

  console.log(`⚡ [COMMAND_LOADER] ${loadedCount} comando(s) de barra carregado(s) com sucesso.`);
}

module.exports = { loadCommands };
