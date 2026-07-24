/**
 * @file src/public/server-dashboard.js
 * @description Lógica principal da SPA (Single Page Application) do Dashboard do Servidor (server-dashboard.html).
 * Gerencia a navegação entre abas com animações ultra suaves (Criar Embed, Editar Embed e Sugestões),
 * gerenciamento de formulários, previews em tempo real e integração completa com a API Express.
 */

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const guildId = urlParams.get('guild') || urlParams.get('guildId') || localStorage.getItem('szlSelectedGuildId');

  if (!guildId) {
    window.location.href = '/';
    return;
  }

  localStorage.setItem('szlSelectedGuildId', guildId);

  // --- Elementos de Navegação SPA ---
  const navItems = document.querySelectorAll('.sidebar-nav .sidebar-item[data-tab]');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // --- Elementos do Perfil e Servidor ---
  const selectedGuildName = document.getElementById('selectedGuildName');
  const guildIconContainer = document.getElementById('guildIconContainer');
  const userProfile = document.getElementById('userProfile');
  const userAvatar = document.getElementById('userAvatar');
  const userTag = document.getElementById('userTag');
  const countPendingBadge = document.getElementById('countPendingBadge');

  // Alterna menu suspenso de logout ao clicar no avatar do usuário (no Mobile)
  if (userProfile) {
    userProfile.addEventListener('click', (e) => {
      if (window.innerWidth <= 900) {
        if (e.target.closest('.logout-btn')) return;
        e.stopPropagation();
        userProfile.classList.toggle('open');
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (userProfile && !userProfile.contains(e.target)) {
      userProfile.classList.remove('open');
    }
  });

  // --- Estado Global ---
  let activeTab = urlParams.get('tab') || 'create';
  let serverRoles = [];
  let targetChannelId = null;
  let targetAdditionalChannelId = null;
  let fieldIdCounter = 0;
  let buttonIdCounter = 0;

  let editingState = {
    active: false,
    messageId: null,
    channelId: null
  };

  /**
   * Notificação estilo Toast.
   */
  function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationMsg = document.getElementById('notificationMsg');
    if (notification && notificationMsg) {
      notificationMsg.textContent = message;
      notification.className = `notification ${type}`;
      notification.classList.remove('hidden');
      setTimeout(() => { notification.classList.add('hidden'); }, 4000);
    }
  }

  function getFormattedTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `Hoje às ${hours}:${minutes}`;
  }

  // ==========================================
  // 1. SISTEMA DE ANIMAÇÃO DE ABAS (SPA SWAP)
  // ==========================================

  function switchTab(targetTabName) {
    if (!targetTabName) return;

    let targetPanelId = 'panelCreateEmbed';
    if (targetTabName === 'edit') targetPanelId = 'panelEditEmbed';
    if (targetTabName === 'suggestions') targetPanelId = 'panelSuggestions';

    const targetPanel = document.getElementById(targetPanelId);
    if (!targetPanel) return;

    // 1. Esconde todos os painéis e remove classes de animação anteriores
    tabPanels.forEach(panel => {
      panel.classList.remove('active-panel', 'animating-out');
      panel.style.display = 'none';
    });

    // 2. Exibe o painel selecionado e força a execução da animação CSS suave
    targetPanel.style.display = 'block';
    void targetPanel.offsetWidth; // Força reflow no navegador
    targetPanel.classList.add('active-panel');

    // 3. Atualiza o estado ativo dos botões do menu lateral
    navItems.forEach(item => {
      const tab = item.getAttribute('data-tab');
      if (tab === targetTabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // 4. Atualiza a URL sem recarregar a página
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('tab', targetTabName);
      history.replaceState(null, '', newUrl.toString());
    } catch (e) {}

    activeTab = targetTabName;

    // 5. Se for a aba de sugestões, recarrega a lista
    if (targetTabName === 'suggestions') {
      loadSuggestions();
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (tab) switchTab(tab);
      if (window.innerWidth <= 900) {
        closeSidebar();
      }
    });
  });

  // ==========================================
  // 2. BUSCA DE CARGOS & DETALHES DO SERVIDOR
  // ==========================================

  function populateRolesDropdown(selectElem, rolesList) {
    if (!selectElem) return;
    selectElem.innerHTML = `
      <option value="">-- Selecione um Cargo --</option>
      <option value="@everyone">📢 @everyone (Notificar todos no servidor)</option>
      <option value="@here">🟢 @here (Notificar membros online)</option>
    `;
    rolesList.forEach(role => {
      const option = document.createElement('option');
      option.value = role.id;
      option.textContent = `@${role.name}`;
      option.style.color = role.color;
      selectElem.appendChild(option);
    });
  }

  async function loadGuildRoles() {
    const cached = sessionStorage.getItem(`szl_roles_${guildId}`);
    if (cached) {
      try {
        serverRoles = JSON.parse(cached);
        populateRolesDropdown(document.getElementById('roleSelectCreate'), serverRoles);
        populateRolesDropdown(document.getElementById('roleSelectEdit'), serverRoles);
      } catch (e) {}
    }

    try {
      const response = await fetch(`/api/guilds/${guildId}/roles`);
      if (response.ok) {
        const data = await response.json();
        serverRoles = data.roles || [];
        sessionStorage.setItem(`szl_roles_${guildId}`, JSON.stringify(serverRoles));
        populateRolesDropdown(document.getElementById('roleSelectCreate'), serverRoles);
        populateRolesDropdown(document.getElementById('roleSelectEdit'), serverRoles);
      }
    } catch (err) {
      console.warn('[SPA] Erro ao carregar cargos:', err);
    }
  }

  async function initializeServerDetails(forceRefresh = false) {
    const destinationTextCreate = document.getElementById('destinationTextCreate');
    const sendBtnCreate = document.getElementById('sendBtnCreate');

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

          if (destinations.length > 0 && destinationTextCreate) {
            destinationTextCreate.textContent = destinations.join(' | ');
            if (sendBtnCreate) sendBtnCreate.disabled = false;
          }
        }
      } catch (e) {}
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

        if (currentGuild) {
          if (selectedGuildName) selectedGuildName.textContent = currentGuild.name;
          if (guildIconContainer) {
            if (currentGuild.icon) {
              guildIconContainer.innerHTML = `<img class="server-avatar-img" src="https://cdn.discordapp.com/icons/${currentGuild.id}/${currentGuild.icon}.png?size=128" alt="${currentGuild.name}">`;
            } else {
              const initials = currentGuild.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
              guildIconContainer.innerHTML = `<div class="server-avatar-fallback">${initials}</div>`;
            }
          }
        }
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

        if (destinationTextCreate) {
          if (destinations.length > 0) {
            destinationTextCreate.textContent = destinations.join(' | ');
            if (sendBtnCreate) sendBtnCreate.disabled = false;
          } else {
            destinationTextCreate.innerHTML = '<span style="color: var(--danger-color); font-weight: 600;">⚠️ Nenhum canal configurado!</span>';
            if (sendBtnCreate) sendBtnCreate.disabled = true;
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Escuta salvamento de configurações no Modal
  window.addEventListener('settingsSaved', () => {
    initializeServerDetails(true);
  });

  const changeChannelsBtnCreate = document.getElementById('changeChannelsBtnCreate');
  if (changeChannelsBtnCreate) {
    changeChannelsBtnCreate.addEventListener('click', () => {
      const openSettingsBtn = document.getElementById('openSettingsModalBtn');
      if (openSettingsBtn) openSettingsBtn.click();
    });
  }

  // ==========================================
  // 3. PAINEL 1: CRIAR EMBED (FORM & PREVIEW)
  // ==========================================

  const embedFormCreate = document.getElementById('embedFormCreate');
  const embedTitleCreate = document.getElementById('embedTitleCreate');
  const embedColorCreate = document.getElementById('embedColorCreate');
  const colorHexTextCreate = document.getElementById('colorHexTextCreate');
  const embedDescriptionCreate = document.getElementById('embedDescriptionCreate');
  const embedThumbnailCreate = document.getElementById('embedThumbnailCreate');
  const embedImageCreate = document.getElementById('embedImageCreate');
  const embedFooterCreate = document.getElementById('embedFooterCreate');
  const fieldsContainerCreate = document.getElementById('fieldsContainerCreate');
  const addFieldBtnCreate = document.getElementById('addFieldBtnCreate');
  const buttonsContainerCreate = document.getElementById('buttonsContainerCreate');
  const addButtonBtnCreate = document.getElementById('addButtonBtnCreate');
  const toggleRoleMentionCreate = document.getElementById('toggleRoleMentionCreate');
  const roleSelectWrapperCreate = document.getElementById('roleSelectWrapperCreate');
  const roleSelectCreate = document.getElementById('roleSelectCreate');
  const sendBtnCreate = document.getElementById('sendBtnCreate');

  const discordEmbedPreviewCreate = document.getElementById('discordEmbedPreviewCreate');
  const previewTitleCreate = document.getElementById('previewTitleCreate');
  const previewDescriptionCreate = document.getElementById('previewDescriptionCreate');
  const previewFieldsCreate = document.getElementById('previewFieldsCreate');
  const previewThumbnailImgCreate = document.getElementById('previewThumbnailImgCreate');
  const previewImageImgCreate = document.getElementById('previewImageImgCreate');
  const previewFooterCreate = document.getElementById('previewFooterCreate');
  const previewButtonsContainerCreate = document.getElementById('previewButtonsContainerCreate');
  const previewRoleMentionCreate = document.getElementById('previewRoleMentionCreate');
  const previewRoleTagCreate = document.getElementById('previewRoleTagCreate');

  function addFieldItemCreate(name = '', value = '', inline = false) {
    const id = fieldIdCounter++;
    const html = `
      <div class="field-item" data-id="${id}">
        <input type="text" class="field-name-input" placeholder="Título (Nome)" value="${name}" required>
        <input type="text" class="field-value-input" placeholder="Conteúdo (Valor)" value="${value}" required>
        <label class="checkbox-group"><input type="checkbox" class="field-inline-input" ${inline ? 'checked' : ''}> Lado a lado</label>
        <button type="button" class="remove-btn">🗑️</button>
      </div>
    `;
    fieldsContainerCreate.insertAdjacentHTML('beforeend', html);
    const item = fieldsContainerCreate.querySelector(`.field-item[data-id="${id}"]`);
    item.querySelectorAll('input').forEach(i => i.addEventListener('input', updatePreviewCreate));
    item.querySelector('.remove-btn').addEventListener('click', () => { item.remove(); updatePreviewCreate(); });
    updatePreviewCreate();
  }

  function addButtonItemCreate(label = '', url = '') {
    const id = buttonIdCounter++;
    const html = `
      <div class="button-item" data-id="${id}">
        <input type="text" class="button-label-input" placeholder="Texto (ex: 🌐 Site)" value="${label}" required>
        <input type="url" class="button-url-input" placeholder="URL (https://...)" value="${url}" required>
        <button type="button" class="remove-btn">🗑️</button>
      </div>
    `;
    buttonsContainerCreate.insertAdjacentHTML('beforeend', html);
    const item = buttonsContainerCreate.querySelector(`.button-item[data-id="${id}"]`);
    item.querySelectorAll('input').forEach(i => i.addEventListener('input', updatePreviewCreate));
    item.querySelector('.remove-btn').addEventListener('click', () => { item.remove(); updatePreviewCreate(); });
    updatePreviewCreate();
  }

  if (addFieldBtnCreate) addFieldBtnCreate.addEventListener('click', () => addFieldItemCreate());
  if (addButtonBtnCreate) addButtonBtnCreate.addEventListener('click', () => addButtonItemCreate());

  [embedTitleCreate, embedDescriptionCreate, embedThumbnailCreate, embedImageCreate, embedFooterCreate, embedColorCreate].forEach(el => {
    if (el) el.addEventListener('input', updatePreviewCreate);
  });

  if (toggleRoleMentionCreate) {
    toggleRoleMentionCreate.addEventListener('change', () => {
      if (toggleRoleMentionCreate.checked) roleSelectWrapperCreate.classList.remove('hidden');
      else { roleSelectWrapperCreate.classList.add('hidden'); roleSelectCreate.value = ''; }
      updatePreviewCreate();
    });
  }
  if (roleSelectCreate) roleSelectCreate.addEventListener('change', updatePreviewCreate);

  function updatePreviewCreate() {
    const time = getFormattedTime();
    document.querySelectorAll('.discordLiveTimestamp').forEach(t => t.textContent = time);

    if (embedTitleCreate.value.trim()) { previewTitleCreate.textContent = embedTitleCreate.value; previewTitleCreate.classList.remove('hidden'); }
    else previewTitleCreate.classList.add('hidden');

    if (embedDescriptionCreate.value.trim()) { previewDescriptionCreate.textContent = embedDescriptionCreate.value; previewDescriptionCreate.style.color = 'var(--discord-text-normal)'; }
    else { previewDescriptionCreate.textContent = 'A descrição do embed aparecerá aqui conforme você digita...'; previewDescriptionCreate.style.color = 'var(--discord-text-muted)'; }

    discordEmbedPreviewCreate.style.borderLeftColor = embedColorCreate.value;
    if (colorHexTextCreate) colorHexTextCreate.textContent = embedColorCreate.value.toLowerCase();

    if (embedThumbnailCreate.value.trim()) { previewThumbnailImgCreate.src = embedThumbnailCreate.value; previewThumbnailImgCreate.classList.remove('hidden'); }
    else previewThumbnailImgCreate.classList.add('hidden');

    if (embedImageCreate.value.trim()) { previewImageImgCreate.src = embedImageCreate.value; previewImageImgCreate.classList.remove('hidden'); }
    else previewImageImgCreate.classList.add('hidden');

    if (embedFooterCreate.value.trim()) { previewFooterCreate.textContent = `${embedFooterCreate.value.trim()} • ${time}`; previewFooterCreate.classList.remove('hidden'); }
    else { previewFooterCreate.textContent = time; previewFooterCreate.classList.remove('hidden'); }

    // Render Fields
    previewFieldsCreate.innerHTML = '';
    fieldsContainerCreate.querySelectorAll('.field-item').forEach(item => {
      const name = item.querySelector('.field-name-input').value.trim();
      const val = item.querySelector('.field-value-input').value.trim();
      const inline = item.querySelector('.field-inline-input').checked;
      if (name || val) {
        const div = document.createElement('div');
        div.className = `discord-embed-field ${inline ? 'inline' : ''}`;
        div.innerHTML = `<div class="discord-embed-field-name">${name || 'Campo'}</div><div class="discord-embed-field-value">${val || 'Valor'}</div>`;
        previewFieldsCreate.appendChild(div);
      }
    });

    // Render Buttons
    previewButtonsContainerCreate.innerHTML = '';
    let hasBtn = false;
    buttonsContainerCreate.querySelectorAll('.button-item').forEach(item => {
      const lbl = item.querySelector('.button-label-input').value.trim();
      const url = item.querySelector('.button-url-input').value.trim();
      if (lbl) {
        hasBtn = true;
        const a = document.createElement('a');
        a.className = 'discord-button-preview';
        a.target = '_blank'; a.href = url || '#';
        a.innerHTML = `<span>${lbl}</span> <span style="font-size:0.75rem;opacity:0.7;">↗</span>`;
        previewButtonsContainerCreate.appendChild(a);
      }
    });
    if (hasBtn) previewButtonsContainerCreate.classList.remove('hidden');
    else previewButtonsContainerCreate.classList.add('hidden');

    // Render Role Mention (Abaixo do Embed)
    if (toggleRoleMentionCreate && toggleRoleMentionCreate.checked && roleSelectCreate.value) {
      const val = roleSelectCreate.value;
      if (val === '@everyone' || val === '@here') {
        previewRoleTagCreate.textContent = val;
        previewRoleTagCreate.style.background = 'rgba(88, 101, 242, 0.2)';
        previewRoleTagCreate.style.color = '#c9cdfb';
      } else {
        const matched = serverRoles.find(r => r.id === val);
        previewRoleTagCreate.textContent = matched ? `@${matched.name}` : '@Cargo';
        previewRoleTagCreate.style.color = matched ? matched.color : '#c9cdfb';
        previewRoleTagCreate.style.background = 'rgba(88, 101, 242, 0.15)';
      }
      previewRoleMentionCreate.classList.remove('hidden');
    } else {
      previewRoleMentionCreate.classList.add('hidden');
    }
  }

  // Submit Criar Embed (POST)
  if (embedFormCreate) {
    embedFormCreate.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!targetChannelId && !targetAdditionalChannelId) {
        showNotification('Configure os canais de destino primeiro.', 'error');
        return;
      }

      if (sendBtnCreate) { sendBtnCreate.disabled = true; sendBtnCreate.innerHTML = '<span>⏳ Enviando Aviso...</span>'; }
      if (quickSendBtnCreate) { quickSendBtnCreate.disabled = true; quickSendBtnCreate.innerHTML = '<span>⏳ Enviando...</span>'; }

      const fields = [];
      fieldsContainerCreate.querySelectorAll('.field-item').forEach(item => {
        const name = item.querySelector('.field-name-input').value.trim();
        const value = item.querySelector('.field-value-input').value.trim();
        const inline = item.querySelector('.field-inline-input').checked;
        if (name && value) fields.push({ name, value, inline });
      });

      const buttons = [];
      buttonsContainerCreate.querySelectorAll('.button-item').forEach(item => {
        const label = item.querySelector('.button-label-input').value.trim();
        const url = item.querySelector('.button-url-input').value.trim();
        if (label && url) buttons.push({ label, url });
      });

      const payload = {
        guildId,
        channelId: targetChannelId || undefined,
        additionalChannelId: targetAdditionalChannelId || undefined,
        roleId: (toggleRoleMentionCreate.checked && roleSelectCreate.value) ? roleSelectCreate.value : undefined,
        title: embedTitleCreate.value.trim(),
        description: embedDescriptionCreate.value.trim(),
        color: embedColorCreate.value,
        thumbnailUrl: embedThumbnailCreate.value.trim(),
        imageUrl: embedImageCreate.value.trim(),
        footer: embedFooterCreate.value.trim(),
        fields: fields.length > 0 ? fields : undefined,
        buttons: buttons.length > 0 ? buttons : undefined
      };

      try {
        const res = await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showNotification(data.message, 'success');
          embedTitleCreate.value = ''; embedDescriptionCreate.value = ''; embedThumbnailCreate.value = ''; embedImageCreate.value = ''; embedFooterCreate.value = '';
          fieldsContainerCreate.innerHTML = ''; buttonsContainerCreate.innerHTML = '';
          toggleRoleMentionCreate.checked = false; roleSelectWrapperCreate.classList.add('hidden'); roleSelectCreate.value = '';
          updatePreviewCreate();
        } else {
          showNotification(data.error || 'Erro ao enviar aviso.', 'error');
        }
      } catch (err) {
        showNotification('Erro na operação. O bot está online?', 'error');
      } finally {
      if (sendBtnCreate) { sendBtnCreate.disabled = false; sendBtnCreate.innerHTML = '<span>🚀 Enviar Aviso ao Discord</span>'; }
      if (quickSendBtnCreate) { quickSendBtnCreate.disabled = false; quickSendBtnCreate.innerHTML = '<span>🚀 Enviar Aviso</span>'; }
      }
    });
  }

  // ==========================================
  // 4. PAINEL 2: EDITAR EMBED POR ID (FORM & PREVIEW)
  // ==========================================

  const fetchMessageIdEdit = document.getElementById('fetchMessageIdEdit');
  const fetchEmbedBtnEdit = document.getElementById('fetchEmbedBtnEdit');
  const editingBannerEdit = document.getElementById('editingBannerEdit');
  const editingInfoTextEdit = document.getElementById('editingInfoTextEdit');

  const embedFormEdit = document.getElementById('embedFormEdit');
  const embedTitleEdit = document.getElementById('embedTitleEdit');
  const embedColorEdit = document.getElementById('embedColorEdit');
  const colorHexTextEdit = document.getElementById('colorHexTextEdit');
  const embedDescriptionEdit = document.getElementById('embedDescriptionEdit');
  const embedThumbnailEdit = document.getElementById('embedThumbnailEdit');
  const embedImageEdit = document.getElementById('embedImageEdit');
  const embedFooterEdit = document.getElementById('embedFooterEdit');
  const fieldsContainerEdit = document.getElementById('fieldsContainerEdit');
  const addFieldBtnEdit = document.getElementById('addFieldBtnEdit');
  const buttonsContainerEdit = document.getElementById('buttonsContainerEdit');
  const addButtonBtnEdit = document.getElementById('addButtonBtnEdit');
  const toggleRoleMentionEdit = document.getElementById('toggleRoleMentionEdit');
  const roleSelectWrapperEdit = document.getElementById('roleSelectWrapperEdit');
  const roleSelectEdit = document.getElementById('roleSelectEdit');
  const sendBtnEdit = document.getElementById('sendBtnEdit');
  const quickSendBtnEdit = document.getElementById('quickSendBtnEdit');

  const discordEmbedPreviewEdit = document.getElementById('discordEmbedPreviewEdit');
  const previewTitleEdit = document.getElementById('previewTitleEdit');
  const previewDescriptionEdit = document.getElementById('previewDescriptionEdit');
  const previewFieldsEdit = document.getElementById('previewFieldsEdit');
  const previewThumbnailImgEdit = document.getElementById('previewThumbnailImgEdit');
  const previewImageImgEdit = document.getElementById('previewImageImgEdit');
  const previewFooterEdit = document.getElementById('previewFooterEdit');
  const previewButtonsContainerEdit = document.getElementById('previewButtonsContainerEdit');
  const previewRoleMentionEdit = document.getElementById('previewRoleMentionEdit');
  const previewRoleTagEdit = document.getElementById('previewRoleTagEdit');

  function addFieldItemEdit(name = '', value = '', inline = false) {
    const id = fieldIdCounter++;
    const html = `
      <div class="field-item" data-id="${id}">
        <input type="text" class="field-name-input" placeholder="Título (Nome)" value="${name}" required>
        <input type="text" class="field-value-input" placeholder="Conteúdo (Valor)" value="${value}" required>
        <label class="checkbox-group"><input type="checkbox" class="field-inline-input" ${inline ? 'checked' : ''}> Lado a lado</label>
        <button type="button" class="remove-btn">🗑️</button>
      </div>
    `;
    fieldsContainerEdit.insertAdjacentHTML('beforeend', html);
    const item = fieldsContainerEdit.querySelector(`.field-item[data-id="${id}"]`);
    item.querySelectorAll('input').forEach(i => i.addEventListener('input', updatePreviewEdit));
    item.querySelector('.remove-btn').addEventListener('click', () => { item.remove(); updatePreviewEdit(); });
    updatePreviewEdit();
  }

  function addButtonItemEdit(label = '', url = '') {
    const id = buttonIdCounter++;
    const html = `
      <div class="button-item" data-id="${id}">
        <input type="text" class="button-label-input" placeholder="Texto (ex: 🌐 Site)" value="${label}" required>
        <input type="url" class="button-url-input" placeholder="URL (https://...)" value="${url}" required>
        <button type="button" class="remove-btn">🗑️</button>
      </div>
    `;
    buttonsContainerEdit.insertAdjacentHTML('beforeend', html);
    const item = buttonsContainerEdit.querySelector(`.button-item[data-id="${id}"]`);
    item.querySelectorAll('input').forEach(i => i.addEventListener('input', updatePreviewEdit));
    item.querySelector('.remove-btn').addEventListener('click', () => { item.remove(); updatePreviewEdit(); });
    updatePreviewEdit();
  }

  if (addFieldBtnEdit) addFieldBtnEdit.addEventListener('click', () => addFieldItemEdit());
  if (addButtonBtnEdit) addButtonBtnEdit.addEventListener('click', () => addButtonItemEdit());

  [embedTitleEdit, embedDescriptionEdit, embedThumbnailEdit, embedImageEdit, embedFooterEdit, embedColorEdit].forEach(el => {
    if (el) el.addEventListener('input', updatePreviewEdit);
  });

  if (toggleRoleMentionEdit) {
    toggleRoleMentionEdit.addEventListener('change', () => {
      if (toggleRoleMentionEdit.checked) roleSelectWrapperEdit.classList.remove('hidden');
      else { roleSelectWrapperEdit.classList.add('hidden'); roleSelectEdit.value = ''; }
      updatePreviewEdit();
    });
  }
  if (roleSelectEdit) roleSelectEdit.addEventListener('change', updatePreviewEdit);

  function updatePreviewEdit() {
    const time = getFormattedTime();

    if (embedTitleEdit.value.trim()) { previewTitleEdit.textContent = embedTitleEdit.value; previewTitleEdit.classList.remove('hidden'); }
    else previewTitleEdit.classList.add('hidden');

    if (embedDescriptionEdit.value.trim()) { previewDescriptionEdit.textContent = embedDescriptionEdit.value; previewDescriptionEdit.style.color = 'var(--discord-text-normal)'; }
    else { previewDescriptionEdit.textContent = 'A descrição do embed aparecerá aqui conforme você edita...'; previewDescriptionEdit.style.color = 'var(--discord-text-muted)'; }

    discordEmbedPreviewEdit.style.borderLeftColor = embedColorEdit.value;
    if (colorHexTextEdit) colorHexTextEdit.textContent = embedColorEdit.value.toLowerCase();

    if (embedThumbnailEdit.value.trim()) { previewThumbnailImgEdit.src = embedThumbnailEdit.value; previewThumbnailImgEdit.classList.remove('hidden'); }
    else previewThumbnailImgEdit.classList.add('hidden');

    if (embedImageEdit.value.trim()) { previewImageImgEdit.src = embedImageEdit.value; previewImageImgEdit.classList.remove('hidden'); }
    else previewImageImgEdit.classList.add('hidden');

    if (embedFooterEdit.value.trim()) { previewFooterEdit.textContent = `${embedFooterEdit.value.trim()} • ${time}`; previewFooterEdit.classList.remove('hidden'); }
    else { previewFooterEdit.textContent = time; previewFooterEdit.classList.remove('hidden'); }

    // Render Fields
    previewFieldsEdit.innerHTML = '';
    fieldsContainerEdit.querySelectorAll('.field-item').forEach(item => {
      const name = item.querySelector('.field-name-input').value.trim();
      const val = item.querySelector('.field-value-input').value.trim();
      const inline = item.querySelector('.field-inline-input').checked;
      if (name || val) {
        const div = document.createElement('div');
        div.className = `discord-embed-field ${inline ? 'inline' : ''}`;
        div.innerHTML = `<div class="discord-embed-field-name">${name || 'Campo'}</div><div class="discord-embed-field-value">${val || 'Valor'}</div>`;
        previewFieldsEdit.appendChild(div);
      }
    });

    // Render Buttons
    previewButtonsContainerEdit.innerHTML = '';
    let hasBtn = false;
    buttonsContainerEdit.querySelectorAll('.button-item').forEach(item => {
      const lbl = item.querySelector('.button-label-input').value.trim();
      const url = item.querySelector('.button-url-input').value.trim();
      if (lbl) {
        hasBtn = true;
        const a = document.createElement('a');
        a.className = 'discord-button-preview';
        a.target = '_blank'; a.href = url || '#';
        a.innerHTML = `<span>${lbl}</span> <span style="font-size:0.75rem;opacity:0.7;">↗</span>`;
        previewButtonsContainerEdit.appendChild(a);
      }
    });
    if (hasBtn) previewButtonsContainerEdit.classList.remove('hidden');
    else previewButtonsContainerEdit.classList.add('hidden');

    // Render Role Mention (Abaixo do Embed)
    if (toggleRoleMentionEdit && toggleRoleMentionEdit.checked && roleSelectEdit.value) {
      const val = roleSelectEdit.value;
      if (val === '@everyone' || val === '@here') {
        previewRoleTagEdit.textContent = val;
        previewRoleTagEdit.style.background = 'rgba(88, 101, 242, 0.2)';
        previewRoleTagEdit.style.color = '#c9cdfb';
      } else {
        const matched = serverRoles.find(r => r.id === val);
        previewRoleTagEdit.textContent = matched ? `@${matched.name}` : '@Cargo';
        previewRoleTagEdit.style.color = matched ? matched.color : '#c9cdfb';
        previewRoleTagEdit.style.background = 'rgba(88, 101, 242, 0.15)';
      }
      previewRoleMentionEdit.classList.remove('hidden');
    } else {
      previewRoleMentionEdit.classList.add('hidden');
    }
  }

  // Busca Embed por ID
  async function handleFetchEmbedEdit() {
    const msgId = fetchMessageIdEdit.value.trim();
    if (!msgId) {
      showNotification('Informe o ID da mensagem no Discord.', 'error');
      return;
    }

    fetchEmbedBtnEdit.disabled = true;
    fetchEmbedBtnEdit.textContent = '⏳ Buscando...';

    try {
      const res = await fetch(`/api/guilds/${guildId}/messages/${msgId}`);
      const data = await res.json();

      if (res.ok && data.embed) {
        embedTitleEdit.value = data.embed.title || '';
        embedDescriptionEdit.value = data.embed.description || '';
        embedColorEdit.value = data.embed.color || '#06b6d4';
        embedThumbnailEdit.value = data.embed.thumbnailUrl || '';
        embedImageEdit.value = data.embed.imageUrl || '';
        embedFooterEdit.value = data.embed.footer || '';

        fieldsContainerEdit.innerHTML = '';
        if (data.embed.fields) data.embed.fields.forEach(f => addFieldItemEdit(f.name, f.value, f.inline));

        buttonsContainerEdit.innerHTML = '';
        if (data.embed.buttons) data.embed.buttons.forEach(b => addButtonItemEdit(b.label, b.url));

        if (data.roleId && toggleRoleMentionEdit && roleSelectEdit) {
          toggleRoleMentionEdit.checked = true;
          roleSelectWrapperEdit.classList.remove('hidden');
          roleSelectEdit.value = data.roleId;
        } else {
          toggleRoleMentionEdit.checked = false;
          roleSelectWrapperEdit.classList.add('hidden');
          roleSelectEdit.value = '';
        }

        editingState = { active: true, messageId: data.messageId, channelId: data.channelId };
        editingInfoTextEdit.textContent = `Mensagem ID: ${data.messageId} no canal #${data.channelName}`;
        editingBannerEdit.classList.remove('hidden');

        updatePreviewEdit();
        showNotification(`Embed carregado do canal #${data.channelName}!`, 'success');
      } else {
        showNotification(data.error || 'Mensagem não encontrada.', 'error');
      }
    } catch (err) {
      showNotification('Erro ao buscar a mensagem.', 'error');
    } finally {
      fetchEmbedBtnEdit.disabled = false;
      fetchEmbedBtnEdit.textContent = '⚡ Carregar Embed';
    }
  }

  if (fetchEmbedBtnEdit) fetchEmbedBtnEdit.addEventListener('click', handleFetchEmbedEdit);
  if (fetchMessageIdEdit) {
    fetchMessageIdEdit.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleFetchEmbedEdit(); }
    });
  }

  // Submit Editar Embed (PUT)
  if (embedFormEdit) {
    embedFormEdit.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editingState.active || !editingState.messageId) {
        showNotification('Carregue uma mensagem por ID primeiro.', 'error');
        fetchMessageIdEdit.focus();
        return;
      }

      if (sendBtnEdit) { sendBtnEdit.disabled = true; sendBtnEdit.innerHTML = '<span>⏳ Salvando Alterações...</span>'; }
      if (quickSendBtnEdit) { quickSendBtnEdit.disabled = true; quickSendBtnEdit.innerHTML = '<span>⏳ Salvando...</span>'; }

      const fields = [];
      fieldsContainerEdit.querySelectorAll('.field-item').forEach(item => {
        const name = item.querySelector('.field-name-input').value.trim();
        const value = item.querySelector('.field-value-input').value.trim();
        const inline = item.querySelector('.field-inline-input').checked;
        if (name && value) fields.push({ name, value, inline });
      });

      const buttons = [];
      buttonsContainerEdit.querySelectorAll('.button-item').forEach(item => {
        const label = item.querySelector('.button-label-input').value.trim();
        const url = item.querySelector('.button-url-input').value.trim();
        if (label && url) buttons.push({ label, url });
      });

      const payload = {
        guildId,
        channelId: editingState.channelId,
        messageId: editingState.messageId,
        roleId: (toggleRoleMentionEdit.checked && roleSelectEdit.value) ? roleSelectEdit.value : undefined,
        title: embedTitleEdit.value.trim(),
        description: embedDescriptionEdit.value.trim(),
        color: embedColorEdit.value,
        thumbnailUrl: embedThumbnailEdit.value.trim(),
        imageUrl: embedImageEdit.value.trim(),
        footer: embedFooterEdit.value.trim(),
        fields: fields.length > 0 ? fields : undefined,
        buttons: buttons.length > 0 ? buttons : undefined
      };

      try {
        const res = await fetch('/api/announcements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          showNotification(data.message, 'success');
        } else {
          showNotification(data.error || 'Erro ao editar a mensagem.', 'error');
        }
      } catch (err) {
        showNotification('Erro na operação.', 'error');
      } finally {
      if (sendBtnEdit) { sendBtnEdit.disabled = false; sendBtnEdit.innerHTML = '<span>💾 Salvar e Editar Mensagem no Discord</span>'; }
      if (quickSendBtnEdit) { quickSendBtnEdit.disabled = false; quickSendBtnEdit.innerHTML = '<span>💾 Salvar Edição</span>'; }
      }
    });
  }

  // ==========================================
  // 5. PAINEL 3: SUGESTÕES (LISTA & DECISÃO)
  // ==========================================

  let currentSugTab = 'PENDING';
  let allSuggestions = [];

  const sugTabBtns = document.querySelectorAll('.sug-tab-btn');
  const suggestionsContainer = document.getElementById('suggestionsContainer');
  const btnRefreshSuggestions = document.getElementById('btnRefreshSuggestions');

  const actionModal = document.getElementById('actionModal');
  const closeActionModalBtn = document.getElementById('closeActionModalBtn');
  const cancelActionBtn = document.getElementById('cancelActionBtn');
  const actionForm = document.getElementById('actionForm');

  sugTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sugTabBtns.forEach(b => b.classList.remove('active-sug-tab'));
      btn.classList.add('active-sug-tab');
      currentSugTab = btn.getAttribute('data-sugtab');
      renderSuggestions();
    });
  });

  if (btnRefreshSuggestions) {
    btnRefreshSuggestions.addEventListener('click', () => {
      btnRefreshSuggestions.style.transform = 'rotate(360deg)';
      setTimeout(() => { btnRefreshSuggestions.style.transform = ''; }, 400);
      loadSuggestions();
    });
  }

  async function loadSuggestions() {
    if (!suggestionsContainer) return;
    suggestionsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Carregando sugestões...</div>';

    try {
      const res = await fetch(`/api/guilds/${guildId}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        allSuggestions = data.suggestions || [];
        updateSuggestionStats(allSuggestions);
        renderSuggestions();
      } else {
        suggestionsContainer.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 40px;">Erro ao carregar sugestões.</div>';
      }
    } catch (err) {
      console.error(err);
      suggestionsContainer.innerHTML = '<div style="text-align: center; color: var(--danger-color); padding: 40px;">Erro de conexão.</div>';
    }
  }

  function updateSuggestionStats(list) {
    const pending = list.filter(s => s.status === 'PENDING').length;
    const approved = list.filter(s => s.status === 'APPROVED').length;
    const rejected = list.filter(s => s.status === 'REJECTED').length;
    let totalVotes = 0;
    list.forEach(s => { if (s.votes) totalVotes += s.votes.length; });

    document.getElementById('statPendingCount').textContent = pending;
    document.getElementById('statApprovedCount').textContent = approved;
    document.getElementById('statRejectedCount').textContent = rejected;
    document.getElementById('statTotalVotesCount').textContent = totalVotes;
    if (countPendingBadge) countPendingBadge.textContent = pending;
  }

  function renderSuggestions() {
    if (!suggestionsContainer) return;
    const filtered = currentSugTab === 'ALL' ? allSuggestions : allSuggestions.filter(s => s.status === currentSugTab);

    if (filtered.length === 0) {
      suggestionsContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 40px; background: rgba(18, 18, 28, 0.4); border-radius: 12px; border: 1px dashed var(--border-color);">Nenhuma sugestão encontrada no filtro "${currentSugTab}".</div>`;
      return;
    }

    suggestionsContainer.innerHTML = filtered.map(s => {
      const supportVotes = s.votes ? s.votes.filter(v => v.type === 'SUPPORT').length : 0;
      const rejectVotes = s.votes ? s.votes.filter(v => v.type === 'REJECT').length : 0;
      const totalV = supportVotes + rejectVotes;
      const percentSupport = totalV > 0 ? Math.round((supportVotes / totalV) * 100) : 50;

      const dateStr = new Date(s.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      return `
        <div class="suggestion-card status-${s.status}">
          <div class="card-top">
            <div class="author-info">
              <div class="author-avatar">${s.authorTag ? s.authorTag[0].toUpperCase() : 'U'}</div>
              <div>
                <strong style="color: #fff; font-size: 0.95rem;">${s.authorTag || 'Desenvolvedor'}</strong>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">#${s.id} • ${dateStr}</div>
              </div>
            </div>
            <span class="status-badge ${s.status}">${s.status === 'PENDING' ? '◇ Em Aberto' : s.status === 'APPROVED' ? '✓ Aprovada' : '✕ Rejeitada'}</span>
          </div>

          <div class="suggestion-content-box">${s.content}</div>

          <div class="vote-bar-wrapper">
            <div class="vote-labels">
              <span style="color: #10b981; font-weight: 600;">▲ Apoios: ${supportVotes}</span>
              <span style="color: #ef4444; font-weight: 600;">▼ Recusas: ${rejectVotes}</span>
            </div>
            <div class="vote-bar-bg">
              <div class="vote-bar-fill" style="width: ${percentSupport}%;"></div>
            </div>
          </div>

          ${s.status === 'PENDING' ? `
            <div class="card-actions">
              <button type="button" class="btn-action btn-approve" onclick="openDecisionModal(${s.id}, 'APPROVED')">
                ✓ Aprovar Proposta
              </button>
              <button type="button" class="btn-action btn-reject" onclick="openDecisionModal(${s.id}, 'REJECTED')">
                ✕ Rejeitar Proposta
              </button>
            </div>
          ` : `
            <div style="font-size: 0.8rem; color: var(--text-secondary); padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.08);">
              Resolvido por <strong style="color: #fff;">${s.resolvedBy || 'Moderador'}</strong> ${s.resolvedNotes ? `• "${s.resolvedNotes}"` : ''}
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  window.openDecisionModal = function(id, actionType) {
    const suggestion = allSuggestions.find(s => s.id === id);
    if (!suggestion) return;

    document.getElementById('modalSuggestionId').value = id;
    document.getElementById('modalActionType').value = actionType;
    document.getElementById('modalTitle').textContent = actionType === 'APPROVED' ? '✅ Aprovar Sugestão' : '❌ Rejeitar Sugestão';
    document.getElementById('modalAuthorTag').textContent = `@${suggestion.authorTag} • Proposta #${suggestion.id}`;
    document.getElementById('modalContentPreview').textContent = `"${suggestion.content}"`;

    // Nome do Moderador preenchido com a sessão
    const userTagElem = document.getElementById('userTag');
    document.getElementById('inputAdminName').value = userTagElem ? userTagElem.textContent.replace('@', '') : 'Moderador';

    if (actionModal) actionModal.classList.remove('hidden');
  };

  function closeDecisionModal() {
    if (actionModal) actionModal.classList.add('hidden');
  }

  if (closeActionModalBtn) closeActionModalBtn.addEventListener('click', closeDecisionModal);
  if (cancelActionBtn) cancelActionBtn.addEventListener('click', closeDecisionModal);

  if (actionForm) {
    actionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('modalSuggestionId').value;
      const actionType = document.getElementById('modalActionType').value;
      const adminName = document.getElementById('inputAdminName').value;
      const adminNotes = document.getElementById('inputAdminNotes').value.trim();

      const btn = document.getElementById('confirmActionBtn');
      btn.disabled = true;
      btn.innerHTML = '<span>⏳ Confirmando...</span>';

      try {
        const res = await fetch(`/api/guilds/${guildId}/suggestions/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: actionType, resolvedBy: adminName, resolvedNotes: adminNotes })
        });
        const data = await res.json();
        if (res.ok) {
          showNotification(`Sugestão #${id} ${actionType === 'APPROVED' ? 'Aprovada' : 'Rejeitada'} com sucesso!`, 'success');
          closeDecisionModal();
          loadSuggestions();
        } else {
          showNotification(data.error || 'Erro ao atualizar sugestão.', 'error');
        }
      } catch (err) {
        showNotification('Erro na operação.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Confirmar Decisão</span>';
      }
    });
  }

  // ==========================================
  // 6. BARRA LATERAL RECOLHÍVEL (BOTAO 3 RISCOS DESKTOP E MOBILE)
  // ==========================================

  const sidebar = document.querySelector('.sidebar');
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function toggleSidebar() {
    if (!sidebar) return;
    const isDesktop = window.innerWidth > 900;
    if (isDesktop) {
      // No Desktop: recolhe/expande a barra lateral para maximizar a área de trabalho
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('szl_sidebar_collapsed', sidebar.classList.contains('collapsed'));
    } else {
      // No Mobile: abre/fecha o drawer
      if (sidebar.classList.contains('active')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }
  }

  function openSidebar() {
    if (sidebar) sidebar.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', toggleSidebar);
  }
  const closeMobileSidebarBtn = document.getElementById('closeMobileSidebarBtn');
  if (closeMobileSidebarBtn) closeMobileSidebarBtn.addEventListener('click', closeSidebar);

  // Restaura estado da barra lateral recolhida no Desktop se salvo
  if (window.innerWidth > 900 && localStorage.getItem('szl_sidebar_collapsed') === 'true') {
    if (sidebar) sidebar.classList.add('collapsed');
  }

  // ==========================================
  // 7. CARREGAMENTO DO USUÁRIO & INICIALIZAÇÃO
  // ==========================================

  async function loadUser() {
    try {
      const res = await fetch('/api/user');
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (data.user) {
        if (data.user.avatar) userAvatar.src = `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=64`;
        else userAvatar.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
        userTag.textContent = `@${data.user.username}`;
        userProfile.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Inicialização SPA
  loadUser();
  initializeServerDetails();
  loadGuildRoles();
  updatePreviewCreate();
  updatePreviewEdit();

  // Troca para a aba correta caso venha no parâmetro da URL
  switchTab(activeTab);
});
