/**
 * @file src/public/settingsModal.js
 * @description Módulo compartilhável para o Modal de Configurações do Servidor.
 * Permite alterar rapidamente os IDs dos canais de aviso/sugestão, GitHub e Status do bot em qualquer tela.
 */

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const guildId = urlParams.get('guild') || urlParams.get('guildId') || localStorage.getItem('szlSelectedGuildId');

    if (!guildId) return;

    const settingsModal = document.getElementById('settingsModal');
    const openSettingsModalBtn = document.getElementById('openSettingsModalBtn');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');

    const configForm = document.getElementById('configForm');
    const channelSelect = document.getElementById('channelSelect');
    const channelNameText = document.getElementById('channelNameText');
    const suggestionChannelInput = document.getElementById('suggestionChannelId');
    const suggestionChannelNameText = document.getElementById('suggestionChannelNameText');
    const githubRepo = document.getElementById('githubRepo');
    const botStatusSelect = document.getElementById('botStatusSelect');
    const saveConfigBtn = document.getElementById('saveConfigBtn');

    function showNotification(message, type = 'success') {
      const notification = document.getElementById('notification');
      const notificationMsg = document.getElementById('notificationMsg');
      if (notification && notificationMsg) {
        notificationMsg.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
        setTimeout(() => {
          notification.classList.add('hidden');
        }, 4000);
      }
    }

    function debounce(func, wait = 600) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    async function resolveChannelName(inputId, textElement) {
      if (!textElement) return;
      const inputElement = document.getElementById(inputId);
      const channelIdVal = inputElement ? inputElement.value.trim() : '';

      if (!channelIdVal) {
        textElement.innerHTML = '';
        return;
      }

      if (isNaN(channelIdVal) || channelIdVal.length < 15) {
        textElement.innerHTML = '<span style="color: var(--danger-color);">⚠️ ID de canal inválido (precisa ser numérico).</span>';
        return;
      }

      textElement.innerHTML = '<span style="color: var(--text-secondary);">⏳ Verificando canal no Discord...</span>';

      try {
        const response = await fetch(`/api/guilds/${guildId}/channels/${channelIdVal}`);
        if (response.ok) {
          const data = await response.json();
          textElement.innerHTML = `✅ Canal encontrado: <span style="color: var(--success-color); font-weight: 600;">#${data.name}</span>`;
        } else {
          textElement.innerHTML = '<span style="color: var(--danger-color);">❌ Canal não encontrado ou sem permissão.</span>';
        }
      } catch (err) {
        textElement.innerHTML = '<span style="color: var(--danger-color);">❌ Erro ao buscar canal.</span>';
      }
    }

    const debouncedResolveMain = debounce(() => resolveChannelName('channelSelect', channelNameText));
    const debouncedResolveSuggestion = debounce(() => resolveChannelName('suggestionChannelId', suggestionChannelNameText));

    if (channelSelect) channelSelect.addEventListener('input', debouncedResolveMain);
    if (suggestionChannelInput) suggestionChannelInput.addEventListener('input', debouncedResolveSuggestion);

    function applyConfigToForm(configData) {
      if (!configData || !configData.config) return;
      if (configData.config.defaultChannelId && channelSelect) {
        channelSelect.value = configData.config.defaultChannelId;
        if (configData.defaultChannelName && channelNameText) {
          channelNameText.innerHTML = `✅ Canal encontrado: <span style="color: var(--success-color); font-weight: 600;">#${configData.defaultChannelName}</span>`;
        }
      }
      if (configData.config.suggestionChannelId && suggestionChannelInput) {
        suggestionChannelInput.value = configData.config.suggestionChannelId;
        if (configData.suggestionChannelName && suggestionChannelNameText) {
          suggestionChannelNameText.innerHTML = `✅ Canal encontrado: <span style="color: var(--success-color); font-weight: 600;">#${configData.suggestionChannelName}</span>`;
        }
      }
      if (configData.config.githubRepo && githubRepo) {
        githubRepo.value = configData.config.githubRepo;
      }
      if (configData.config.statusTemplate && botStatusSelect) {
        botStatusSelect.value = configData.config.statusTemplate;
      }
    }

    async function loadSettingsIntoModal() {
      // 1. Tenta carregar do cache local instantaneamente (0ms)
      const cached = sessionStorage.getItem(`szl_config_${guildId}`);
      if (cached) {
        try { applyConfigToForm(JSON.parse(cached)); } catch (e) {}
      }

      // 2. Busca dados atualizados da API em segundo plano
      try {
        const configRes = await fetch(`/api/guilds/${guildId}/config`);
        if (configRes.ok) {
          const configData = await configRes.json();
          sessionStorage.setItem(`szl_config_${guildId}`, JSON.stringify(configData));
          applyConfigToForm(configData);
        }
      } catch (err) {
        console.error('[SETTINGS_MODAL] Erro ao carregar configurações:', err);
      }
    }

    function openModal() {
      if (settingsModal) {
        settingsModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        loadSettingsIntoModal();
      }
    }

    function closeModal() {
      if (settingsModal) {
        settingsModal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    }

    if (openSettingsModalBtn) openSettingsModalBtn.addEventListener('click', openModal);
    if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeModal);
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', closeModal);

    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsModal && !settingsModal.classList.contains('hidden')) {
        closeModal();
      }
    });

    if (configForm) {
      configForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const defaultChannelId = channelSelect ? channelSelect.value.trim() : '';
        const sugChannelIdVal = suggestionChannelInput ? suggestionChannelInput.value.trim() : '';
        const repoValue = githubRepo ? githubRepo.value.trim() : '';
        const statusValue = botStatusSelect ? botStatusSelect.value : 'online';

        if (!defaultChannelId && !sugChannelIdVal) {
          showNotification('Defina ao menos um ID de canal principal ou de sugestões.', 'error');
          return;
        }

        if (repoValue && !/^[a-zA-Z0-9_\-\.]+?\/[a-zA-Z0-9_\-\.]+?$/.test(repoValue)) {
          showNotification('Formato de repositório inválido. Use "dono/repositorio".', 'error');
          return;
        }

        if (saveConfigBtn) {
          saveConfigBtn.disabled = true;
          saveConfigBtn.innerHTML = '<span>⏳ Salvando no Banco...</span>';
        }

        try {
          const response = await fetch(`/api/guilds/${guildId}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              defaultChannelId: defaultChannelId || null,
              suggestionChannelId: sugChannelIdVal || null,
              githubRepo: repoValue || null,
              statusTemplate: statusValue || 'online'
            })
          });

          const data = await response.json();
          if (response.ok) {
            showNotification('Configurações salvas com sucesso!', 'success');
            closeModal();
            window.dispatchEvent(new CustomEvent('settingsSaved'));
          } else {
            showNotification(data.error || 'Erro ao salvar configurações.', 'error');
          }
        } catch (err) {
          console.error(err);
          showNotification('Erro ao salvar configurações.', 'error');
        } finally {
          if (saveConfigBtn) {
            saveConfigBtn.disabled = false;
            saveConfigBtn.innerHTML = '<span>💾 Salvar Configurações</span>';
          }
        }
      });
    }
  });
})();
