/**
 * @file src/utils/eventLoader.js
 * @description Utilitário para carregamento e registro dinâmico de Eventos do Discord Gateway.
 * @module utils/eventLoader
 */

const fs = require('fs');
const path = require('path');

/**
 * Carrega e registra todos os manipuladores de eventos .js presentes na pasta especificada.
 *
 * @param {import('discord.js').Client} client - Instância do Cliente do Discord.
 * @param {string} eventsDirPath - Caminho absoluto para a pasta de eventos.
 */
function loadEvents(client, eventsDirPath) {
  if (!fs.existsSync(eventsDirPath)) {
    console.warn(`[EVENT_LOADER] Pasta de eventos não encontrada: ${eventsDirPath}`);
    return;
  }

  const eventFiles = fs.readdirSync(eventsDirPath).filter(file => file.endsWith('.js'));
  let loadedCount = 0;

  for (const file of eventFiles) {
    const filePath = path.join(eventsDirPath, file);
    try {
      const event = require(filePath);
      if (event.name && typeof event.execute === 'function') {
        if (event.once) {
          client.once(event.name, (...args) => event.execute(...args, client));
        } else {
          client.on(event.name, (...args) => event.execute(...args, client));
        }
        loadedCount++;
      } else {
        console.warn(`[EVENT_LOADER] O evento em ${filePath} está sem a propriedade "name" ou "execute".`);
      }
    } catch (err) {
      console.error(`[EVENT_LOADER] Erro ao carregar o evento ${filePath}:`, err);
    }
  }

  console.log(`📡 [EVENT_LOADER] ${loadedCount} evento(s) registrado(s) com sucesso.`);
}

module.exports = { loadEvents };
