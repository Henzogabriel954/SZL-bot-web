/**
 * @file src/public/editar.js
 * @description Lógica do cliente dedicada exclusivamente para Editar Embeds por ID de Mensagem (editar.html).
 * Carrega a mensagem do Discord via ID, preenche formulários, atualiza o preview em tempo real e envia alterações à API (PUT).
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
  const backToServerLink = document.getElementById('backToServerLink');
  const goToCreateBtn = document.getElementById('goToCreateBtn');
  
  if (backToServerLink) backToServerLink.href = `/server?guild=${guildId}`;
  if (goToCreateBtn) goToCreateBtn.href = `/editor?guild=${guildId}`;

  // --- Elementos do Formulário de Edição ---
  const embedForm = document.getElementById('embedForm');
  const fetchMessageId = document.getElementById('fetchMessageId');
  const fetchEmbedBtn = document.getElementById('fetchEmbedBtn');
  const editingBanner = document.getElementById('editingBanner');
  const editingInfoText = document.getElementById('editingInfoText');

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

  // --- Estado de Edição ---
  let fieldIdCounter = 0;
  let buttonIdCounter = 0;
  let serverRoles = [];

  let editingState = {
    active: false,
    messageId: null,
    channelId: null
  };

  /**
   * Exibe uma notificação estilo Toast.
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
   * Formata a hora atual (ex: "Hoje às 14:30").
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
   * Busca e carrega a lista de cargos do servidor (Ultra rápido com Cache).
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
      console.warn('[EDITAR] Falha ao carregar cargos:', err);
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
   * Renderiza os campos dinâmicos na pré-visualização.
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
   * Renderiza os botões de link na pré-visualização.
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
   * Atualiza toda a pré-visualização em tempo real.
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
      previewDescription.textContent = 'A descrição do embed aparecerá aqui conforme você edita...';
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

    // Atualiza Menção do Cargo abaixo do Embed no preview
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
   * Puxa e carrega o conteúdo de um embed existente via ID da Mensagem.
   */
  async function handleFetchEmbed() {
    const msgId = fetchMessageId.value.trim();
    if (!msgId) {
      showNotification('Por favor, informe o ID da mensagem no Discord.', 'error');
      return;
    }

    fetchEmbedBtn.disabled = true;
    fetchEmbedBtn.textContent = '⏳ Buscando...';

    try {
      const response = await fetch(`/api/guilds/${guildId}/messages/${msgId}`);
      const data = await response.json();

      if (response.ok && data.embed) {
        embedTitle.value = data.embed.title || '';
        embedDescription.value = data.embed.description || '';
        embedColor.value = data.embed.color || '#06b6d4';
        embedThumbnail.value = data.embed.thumbnailUrl || '';
        embedImage.value = data.embed.imageUrl || '';
        embedFooter.value = data.embed.footer || '';

        // Carrega campos
        fieldsContainer.innerHTML = '';
        if (data.embed.fields && data.embed.fields.length > 0) {
          data.embed.fields.forEach(f => addFieldItem(f.name, f.value, f.inline));
        }

        // Carrega botões
        if (buttonsContainer) buttonsContainer.innerHTML = '';
        if (data.embed.buttons && data.embed.buttons.length > 0) {
          data.embed.buttons.forEach(b => addButtonItem(b.label, b.url));
        }

        // Carrega seleção de cargo se presente na mensagem
        if (data.roleId && toggleRoleMention && roleSelect) {
          toggleRoleMention.checked = true;
          if (roleSelectWrapper) roleSelectWrapper.classList.remove('hidden');
          roleSelect.value = data.roleId;
        } else if (toggleRoleMention && roleSelect) {
          toggleRoleMention.checked = false;
          if (roleSelectWrapper) roleSelectWrapper.classList.add('hidden');
          roleSelect.value = '';
        }

        editingState = {
          active: true,
          messageId: data.messageId,
          channelId: data.channelId
        };

        if (editingInfoText) editingInfoText.textContent = `Mensagem ID: ${data.messageId} no canal #${data.channelName}`;
        if (editingBanner) editingBanner.classList.remove('hidden');

        updatePreview();

        if (!data.isAuthor) {
          showNotification('Aviso: O bot não é o autor desta mensagem. O Discord não permite editar mensagens enviadas por outros usuários.', 'error');
        } else {
          showNotification(`Embed carregado com sucesso do canal #${data.channelName}!`, 'success');
        }
      } else {
        showNotification(data.error || 'Mensagem ou embed não encontrado.', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Erro ao buscar a mensagem do Discord.', 'error');
    } finally {
      fetchEmbedBtn.disabled = false;
      fetchEmbedBtn.textContent = '⚡ Carregar Embed';
    }
  }

  if (fetchEmbedBtn) fetchEmbedBtn.addEventListener('click', handleFetchEmbed);
  if (fetchMessageId) {
    fetchMessageId.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFetchEmbed();
      }
    });
  }

  /**
   * Carrega detalhes do servidor (Ultra rápido com Cache).
   */
  async function initializeServerDetails() {
    const cachedGuilds = sessionStorage.getItem('szl_user_guilds');
    if (cachedGuilds) {
      try {
        const guildsData = JSON.parse(cachedGuilds);
        const currentGuild = guildsData.find(g => g.id === guildId);
        if (currentGuild && selectedGuildName) selectedGuildName.textContent = currentGuild.name;
      } catch (e) {}
    }

    try {
      const response = await fetch('/api/guilds');
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (response.ok) {
        const data = await response.json();
        const guildsList = data.guilds || [];
        sessionStorage.setItem('szl_user_guilds', JSON.stringify(guildsList));
        const currentGuild = guildsList.find(g => g.id === guildId);
        if (currentGuild && selectedGuildName) selectedGuildName.textContent = currentGuild.name;
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes do servidor:', err);
    }
  }

  // --- Submissão do Formulário de Edição ---
  embedForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!editingState.active || !editingState.messageId) {
      const msgId = fetchMessageId.value.trim();
      if (!msgId) {
        showNotification('Cole o ID da mensagem no campo acima e clique em "Carregar Embed" primeiro.', 'error');
        fetchMessageId.focus();
        return;
      }
      await handleFetchEmbed();
      if (!editingState.active) return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span>⏳ Salvando Alterações...</span>';

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
      channelId: editingState.channelId,
      messageId: editingState.messageId,
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        showNotification(data.message, 'success');
      } else {
        showNotification(data.error || 'Ocorreu um erro ao editar a mensagem.', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Erro ao comunicar com a API do servidor.', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span>💾 Salvar e Editar Mensagem no Discord</span>';
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
      console.error('Erro ao carregar usuário:', err);
    }
  }

  // --- Inicialização da Página de Edição ---
  updatePreview();
  loadUser();
  initializeServerDetails();
  loadGuildRoles();
});
