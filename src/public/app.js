/**
 * @file src/public/app.js
 * @description Lógica do cliente dedicada exclusivamente para o Criador de Novos Embeds (editor.html).
 * Preenchimento dinâmico de formulários, campos adicionais, botões de link, seleção de cargos,
 * pré-visualização em tempo real e envio de avisos à API Express (POST).
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const guildId = urlParams.get('guild');

  if (!guildId) {
    window.location.href = '/';
    return;
  }

  // --- Elementos de Navegação e Perfil ---
  const selectedGuildName = document.getElementById('selectedGuildName');
  const destinationText = document.getElementById('destinationText');
  const changeChannelsLink = document.getElementById('changeChannelsLink');
  const goToEditBtn = document.getElementById('goToEditBtn');
  const backToServerLink = document.getElementById('backToServerLink');

  if (backToServerLink) backToServerLink.href = `/server?guild=${guildId}`;
  if (goToEditBtn) goToEditBtn.href = `/editar?guild=${guildId}`;

  if (changeChannelsLink) {
    changeChannelsLink.addEventListener('click', (e) => {
      e.preventDefault();
      const openModalBtn = document.getElementById('openSettingsModalBtn');
      if (openModalBtn) openModalBtn.click();
    });
  }

  window.addEventListener('settingsSaved', () => {
    initializeServerDetails();
  });

  // --- Elementos do Formulário ---
  const embedForm = document.getElementById('embedForm');
  const embedTitle = document.getElementById('embedTitle');
  const embedColor = document.getElementById('embedColor');
  const colorHexText = document.getElementById('colorHexText');
  const embedDescription = document.getElementById('embedDescription');
  const embedThumbnail = document.getElementById('embedThumbnail');
  const embedImage = document.getElementById('embedImage');
  const embedFooter = document.getElementById('embedFooter');

  const fieldsContainer = document.getElementById('fieldsContainer');
  const addFieldBtn = document.getElementById('addFieldBtn');
  const buttonsContainer = document.getElementById('buttonsContainer');
  const addButtonBtn = document.getElementById('addButtonBtn');
  const presetButtons = document.querySelectorAll('.preset-btn');
  const sendBtn = document.getElementById('sendBtn');

  // --- Elementos de Cargo / Notificação ---
  const toggleRoleMention = document.getElementById('toggleRoleMention');
  const roleSelectWrapper = document.getElementById('roleSelectWrapper');
  const roleSelect = document.getElementById('roleSelect');
  const previewRoleMention = document.getElementById('previewRoleMention');
  const previewRoleTag = document.getElementById('previewRoleTag');

  // --- Elementos da Pré-visualização (Live Preview) ---
  const discordEmbedPreview = document.getElementById('discordEmbedPreview');
  const previewTitle = document.getElementById('previewTitle');
  const previewDescription = document.getElementById('previewDescription');
  const previewFields = document.getElementById('previewFields');
  const previewThumbnailImg = document.getElementById('previewThumbnailImg');
  const previewImageImg = document.getElementById('previewImageImg');
  const previewFooter = document.getElementById('previewFooter');
  const previewButtonsContainer = document.getElementById('previewButtonsContainer');
  const discordLiveTimestamp = document.getElementById('discordLiveTimestamp');

  // --- Elementos da Notificação ---
  const notification = document.getElementById('notification');
  const notificationMsg = document.getElementById('notificationMsg');

  // --- Estado de Controle ---
  let fieldIdCounter = 0;
  let buttonIdCounter = 0;
  let serverRoles = [];

  let targetChannelId = null;
  let targetAdditionalChannelId = null;

  /**
   * Exibe uma notificação estilo Toast na tela.
   */
  function showNotification(message, type = 'success') {
    notificationMsg.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');
    setTimeout(() => {
      notification.classList.add('hidden');
    }, 4000);
  }

  /**
   * Retorna a hora atual formatada em pt-BR (ex: "Hoje às 14:30").
   */
  function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `Hoje às ${hours}:${minutes}`;
  }

  function populateRolesSelect(rolesList) {
    if (!roleSelect || !rolesList) return;
    serverRoles = rolesList;
    roleSelect.innerHTML = `
      <option value="">-- Selecione um Cargo --</option>
      <option value="@everyone">📢 @everyone (Notificar todos no servidor)</option>
      <option value="@here">🟢 @here (Notificar membros online)</option>
    `;
    serverRoles.forEach(role => {
      const option = document.createElement('option');
      option.value = role.id;
      option.textContent = `@${role.name}`;
      option.style.color = role.color;
      roleSelect.appendChild(option);
    });
  }

  /**
   * Busca e carrega os cargos do servidor (Ultra rápido com Cache).
   */
  async function loadGuildRoles() {
    const cached = sessionStorage.getItem(`szl_roles_${guildId}`);
    if (cached) {
      try { populateRolesSelect(JSON.parse(cached)); } catch (e) {}
    }

    try {
      const response = await fetch(`/api/guilds/${guildId}/roles`);
      if (response.ok) {
        const data = await response.json();
        const roles = data.roles || [];
        sessionStorage.setItem(`szl_roles_${guildId}`, JSON.stringify(roles));
        populateRolesSelect(roles);
      }
    } catch (err) {
      console.warn('[APP] Erro ao carregar cargos:', err);
    }
  }

  /**
   * Adiciona um campo de texto dinâmico (Field) no formulário.
   */
  function addFieldItem(name = '', value = '', inline = false) {
    const id = fieldIdCounter++;
    const safeName = name ? name.replace(/"/g, '&quot;') : '';
    const safeVal = value ? value.replace(/"/g, '&quot;') : '';

    const fieldHtml = `
      <div class="field-item" data-id="${id}">
        <input type="text" class="field-name-input" placeholder="Título (Nome)" value="${safeName}" required>
        <input type="text" class="field-value-input" placeholder="Conteúdo (Valor)" value="${safeVal}" required>
        <label class="checkbox-group">
          <input type="checkbox" class="field-inline-input" ${inline ? 'checked' : ''}> Lado a lado
        </label>
        <button type="button" class="remove-btn" title="Remover Campo">🗑️</button>
      </div>
    `;
    
    fieldsContainer.insertAdjacentHTML('beforeend', fieldHtml);
    
    const newItem = fieldsContainer.querySelector(`.field-item[data-id="${id}"]`);
    const inputs = newItem.querySelectorAll('input');
    const removeBtn = newItem.querySelector('.remove-btn');

    inputs.forEach(input => input.addEventListener('input', renderFieldsPreview));
    removeBtn.addEventListener('click', () => {
      newItem.remove();
      renderFieldsPreview();
    });

    renderFieldsPreview();
  }

  /**
   * Adiciona um item de Botão de Link Externo no formulário.
   */
  function addButtonItem(label = '', url = '') {
    const id = buttonIdCounter++;
    const safeLabel = label ? label.replace(/"/g, '&quot;') : '';
    const safeUrl = url ? url.replace(/"/g, '&quot;') : '';

    const buttonHtml = `
      <div class="button-item" data-id="${id}">
        <input type="text" class="button-label-input" placeholder="Texto (ex: 🌐 Visitar Site)" value="${safeLabel}" required>
        <input type="url" class="button-url-input" placeholder="URL Link (https://...)" value="${safeUrl}" required>
        <button type="button" class="remove-btn" title="Remover Botão">🗑️</button>
      </div>
    `;
    
    buttonsContainer.insertAdjacentHTML('beforeend', buttonHtml);
    
    const newItem = buttonsContainer.querySelector(`.button-item[data-id="${id}"]`);
    const inputs = newItem.querySelectorAll('input');
    const removeBtn = newItem.querySelector('.remove-btn');

    inputs.forEach(input => input.addEventListener('input', renderButtonsPreview));
    removeBtn.addEventListener('click', () => {
      newItem.remove();
      renderButtonsPreview();
    });

    renderButtonsPreview();
  }

  /**
   * Renderiza os campos dinâmicos na área de pré-visualização.
   */
  function renderFieldsPreview() {
    previewFields.innerHTML = '';
    const fieldItems = fieldsContainer.querySelectorAll('.field-item');

    fieldItems.forEach(item => {
      const nameInput = item.querySelector('.field-name-input');
      const valInput = item.querySelector('.field-value-input');
      const inlineInput = item.querySelector('.field-inline-input');

      const nameText = nameInput.value.trim();
      const valText = valInput.value.trim();

      if (nameText || valText) {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'discord-embed-field';
        if (inlineInput.checked) fieldDiv.classList.add('inline');

        const nameSpan = document.createElement('div');
        nameSpan.className = 'discord-embed-field-name';
        nameSpan.textContent = nameText || 'Nome do Campo';

        const valSpan = document.createElement('div');
        valSpan.className = 'discord-embed-field-value';
        valSpan.textContent = valText || 'Valor do Campo';

        fieldDiv.appendChild(nameSpan);
        fieldDiv.appendChild(valSpan);
        previewFields.appendChild(fieldDiv);
      }
    });
  }

  /**
   * Renderiza os botões de link na área de pré-visualização.
   */
  function renderButtonsPreview() {
    if (!previewButtonsContainer) return;
    previewButtonsContainer.innerHTML = '';
    const btnItems = buttonsContainer ? buttonsContainer.querySelectorAll('.button-item') : [];

    if (btnItems.length === 0) {
      previewButtonsContainer.classList.add('hidden');
      return;
    }

    let hasValidBtn = false;
    btnItems.forEach(item => {
      const lbl = item.querySelector('.button-label-input').value.trim();
      const href = item.querySelector('.button-url-input').value.trim();

      if (lbl) {
        hasValidBtn = true;
        const a = document.createElement('a');
        a.className = 'discord-button-preview';
        a.target = '_blank';
        a.href = href || '#';
        a.innerHTML = `<span>${lbl}</span> <span style="font-size: 0.75rem; opacity: 0.7;">↗</span>`;
        previewButtonsContainer.appendChild(a);
      }
    });

    if (hasValidBtn) {
      previewButtonsContainer.classList.remove('hidden');
    } else {
      previewButtonsContainer.classList.add('hidden');
    }
  }

  // --- Ouvintes de Eventos de Formulário ---
  if (addFieldBtn) addFieldBtn.addEventListener('click', () => addFieldItem('', '', false));
  if (addButtonBtn) addButtonBtn.addEventListener('click', () => addButtonItem('', ''));

  [embedTitle, embedDescription, embedThumbnail, embedImage, embedFooter].forEach(input => {
    if (input) input.addEventListener('input', updatePreview);
  });

  if (embedColor) embedColor.addEventListener('input', updatePreview);

  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      embedColor.value = btn.getAttribute('data-color');
      updatePreview();
    });
  });

  if (toggleRoleMention) {
    toggleRoleMention.addEventListener('change', () => {
      if (toggleRoleMention.checked) {
        if (roleSelectWrapper) roleSelectWrapper.classList.remove('hidden');
      } else {
        if (roleSelectWrapper) roleSelectWrapper.classList.add('hidden');
        if (roleSelect) roleSelect.value = '';
      }
      updatePreview();
    });
  }

  if (roleSelect) {
    roleSelect.addEventListener('change', updatePreview);
  }

  /**
   * Atualiza a pré-visualização em tempo real.
   */
  function updatePreview() {
    const currentTime = getFormattedTime();
    if (discordLiveTimestamp) discordLiveTimestamp.textContent = currentTime;

    if (embedTitle.value.trim()) {
      previewTitle.textContent = embedTitle.value;
      previewTitle.classList.remove('hidden');
    } else {
      previewTitle.classList.add('hidden');
    }

    if (embedDescription.value.trim()) {
      previewDescription.textContent = embedDescription.value;
      previewDescription.style.color = 'var(--discord-text-normal)';
    } else {
      previewDescription.textContent = 'A descrição do embed aparecerá aqui conforme você digita...';
      previewDescription.style.color = 'var(--discord-text-muted)';
    }

    discordEmbedPreview.style.borderLeftColor = embedColor.value;
    if (colorHexText) colorHexText.textContent = embedColor.value.toLowerCase();

    if (embedThumbnail.value.trim()) {
      previewThumbnailImg.src = embedThumbnail.value;
      previewThumbnailImg.classList.remove('hidden');
    } else {
      previewThumbnailImg.classList.add('hidden');
    }

    if (embedImage.value.trim()) {
      previewImageImg.src = embedImage.value;
      previewImageImg.classList.remove('hidden');
    } else {
      previewImageImg.classList.add('hidden');
    }

    if (embedFooter.value.trim()) {
      previewFooter.textContent = `${embedFooter.value.trim()} • ${currentTime}`;
      previewFooter.classList.remove('hidden');
    } else {
      previewFooter.textContent = currentTime;
      previewFooter.classList.remove('hidden');
    }

    renderFieldsPreview();
    renderButtonsPreview();

    // Atualiza Pré-visualização da Menção de Cargo (Abaixo do Embed)
    if (previewRoleMention && previewRoleTag) {
      const isRoleMentionActive = toggleRoleMention && toggleRoleMention.checked && roleSelect && roleSelect.value;
      if (isRoleMentionActive) {
        const val = roleSelect.value;
        if (val === '@everyone' || val === '@here') {
          previewRoleTag.textContent = val;
          previewRoleTag.style.background = 'rgba(88, 101, 242, 0.2)';
          previewRoleTag.style.color = '#c9cdfb';
        } else {
          const matchedRole = serverRoles.find(r => r.id === val);
          const roleName = matchedRole ? `@${matchedRole.name}` : '@Cargo';
          const roleColor = matchedRole ? matchedRole.color : '#c9cdfb';
          previewRoleTag.textContent = roleName;
          previewRoleTag.style.color = roleColor;
          previewRoleTag.style.background = 'rgba(88, 101, 242, 0.15)';
        }
        previewRoleMention.classList.remove('hidden');
      } else {
        previewRoleMention.classList.add('hidden');
      }
    }
  }

  /**
   * Sincroniza detalhes da guilda e canais configurados (Ultra Rápido com Cache e Busca Paralela).
   */
  async function initializeServerDetails(forceRefresh = false) {
    const cachedConfig = sessionStorage.getItem(`szl_config_${guildId}`);
    const cachedGuilds = sessionStorage.getItem('szl_user_guilds');

    if (cachedGuilds && cachedConfig && !forceRefresh) {
      try {
        const guildsData = JSON.parse(cachedGuilds);
        const configData = JSON.parse(cachedConfig);
        const currentGuild = guildsData.find(g => g.id === guildId);
        if (currentGuild && selectedGuildName) selectedGuildName.textContent = currentGuild.name;

        if (configData && configData.config) {
          targetChannelId = configData.config.defaultChannelId;
          targetAdditionalChannelId = configData.config.customChannelId;
          const destinations = [];
          if (targetChannelId) destinations.push(configData.defaultChannelName ? `Principal: #${configData.defaultChannelName}` : `Principal (ID: ${targetChannelId})`);
          if (targetAdditionalChannelId) destinations.push(configData.customChannelName ? `Novidades: #${configData.customChannelName}` : `Novidades (ID: ${targetAdditionalChannelId})`);

          if (destinations.length > 0) {
            destinationText.textContent = destinations.join(' | ');
            sendBtn.disabled = false;
          }
        }
      } catch (e) {}
    } else {
      destinationText.textContent = 'Buscando canais configurados...';
    }

    try {
      const [guildsRes, configRes] = await Promise.all([
        fetch('/api/guilds'),
        fetch(`/api/guilds/${guildId}/config`)
      ]);

      if (guildsRes.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (guildsRes.ok) {
        const guildsData = await guildsRes.json();
        const guildsList = guildsData.guilds || [];
        sessionStorage.setItem('szl_user_guilds', JSON.stringify(guildsList));
        const currentGuild = guildsList.find(g => g.id === guildId);
        if (currentGuild && selectedGuildName) selectedGuildName.textContent = currentGuild.name;
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        sessionStorage.setItem(`szl_config_${guildId}`, JSON.stringify(configData));

        let destinations = [];
        if (configData.config) {
          targetChannelId = configData.config.defaultChannelId;
          targetAdditionalChannelId = configData.config.customChannelId;

          if (targetChannelId) {
            destinations.push(configData.defaultChannelName ? `Principal: #${configData.defaultChannelName}` : `Principal (ID: ${targetChannelId})`);
          }
          if (targetAdditionalChannelId) {
            destinations.push(configData.customChannelName ? `Novidades: #${configData.customChannelName}` : `Novidades (ID: ${targetAdditionalChannelId})`);
          }
        }

        if (destinations.length > 0) {
          destinationText.textContent = destinations.join(' | ');
          sendBtn.disabled = false;
        } else {
          destinationText.innerHTML = '<span style="color: var(--danger-color); font-weight: 600;">⚠️ Nenhum canal configurado no Painel!</span>';
          sendBtn.disabled = true;
          showNotification('Configure os canais de destino no Painel antes de enviar o aviso.', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      if (!destinationText.textContent.includes('Principal')) {
        destinationText.textContent = 'Erro ao carregar canais do servidor.';
      }
    }
  }

  // --- Submissão do Formulário Principal (POST) ---
  embedForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!targetChannelId && !targetAdditionalChannelId) {
      showNotification('Configure os canais de destino no painel do servidor primeiro.', 'error');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span>⏳ Enviando Aviso ao Discord...</span>';

    const fields = [];
    const fieldItems = fieldsContainer.querySelectorAll('.field-item');
    fieldItems.forEach(item => {
      const name = item.querySelector('.field-name-input').value.trim();
      const value = item.querySelector('.field-value-input').value.trim();
      const inline = item.querySelector('.field-inline-input').checked;
      if (name && value) fields.push({ name, value, inline });
    });

    const buttons = [];
    if (buttonsContainer) {
      const btnItems = buttonsContainer.querySelectorAll('.button-item');
      btnItems.forEach(item => {
        const label = item.querySelector('.button-label-input').value.trim();
        const url = item.querySelector('.button-url-input').value.trim();
        if (label && url) buttons.push({ label, url });
      });
    }

    const payload = {
      guildId,
      channelId: targetChannelId || undefined,
      additionalChannelId: targetAdditionalChannelId || undefined,
      roleId: (toggleRoleMention && toggleRoleMention.checked && roleSelect) ? (roleSelect.value || undefined) : undefined,
      title: embedTitle.value.trim(),
      description: embedDescription.value.trim(),
      color: embedColor.value,
      thumbnailUrl: embedThumbnail.value.trim(),
      imageUrl: embedImage.value.trim(),
      footer: embedFooter.value.trim(),
      fields: fields.length > 0 ? fields : undefined,
      buttons: buttons.length > 0 ? buttons : undefined
    };

    try {
      const response = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        showNotification(data.message, 'success');
        embedTitle.value = '';
        embedDescription.value = '';
        embedThumbnail.value = '';
        embedImage.value = '';
        embedFooter.value = '';
        fieldsContainer.innerHTML = '';
        if (buttonsContainer) buttonsContainer.innerHTML = '';
        if (toggleRoleMention) toggleRoleMention.checked = false;
        if (roleSelectWrapper) roleSelectWrapper.classList.add('hidden');
        if (roleSelect) roleSelect.value = '';
        updatePreview();
      } else {
        showNotification(data.error || 'Ocorreu um erro ao enviar o aviso.', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Erro de conexão ao enviar aviso ao Discord.', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span>🚀 Enviar Aviso ao Discord</span>';
    }
  });

  /**
   * Carrega perfil do usuário.
   */
  async function loadUser() {
    try {
      const response = await fetch('/api/user');
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await response.json();
      if (data.user) {
        const userProfile = document.getElementById('userProfile');
        const userAvatar = document.getElementById('userAvatar');
        const userTag = document.getElementById('userTag');

        if (data.user.avatar) {
          userAvatar.src = `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=64`;
        } else {
          userAvatar.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
        userTag.textContent = data.user.username;
        userProfile.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Erro ao carregar perfil do usuário:', err);
    }
  }

  // --- Inicialização da Página de Criação ---
  updatePreview();
  loadUser();
  initializeServerDetails();
  loadGuildRoles();
});
