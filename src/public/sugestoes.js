/* ==========================================================================
   PAINEL DE SUGESTÕES — SZL-BOT (CLIENT SCRIPT)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.querySelector('.sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  const navItems = document.querySelectorAll('.sidebar-nav .sidebar-item');
  const suggestionsContainer = document.getElementById('suggestionsContainer');
  const btnRefreshSuggestions = document.getElementById('btnRefreshSuggestions');
  const pageTitle = document.getElementById('pageTitle');

  // Stats Elements
  const statPendingCount = document.getElementById('statPendingCount');
  const statApprovedCount = document.getElementById('statApprovedCount');
  const statRejectedCount = document.getElementById('statRejectedCount');
  const statTotalVotesCount = document.getElementById('statTotalVotesCount');

  const countPending = document.getElementById('countPending');
  const countApproved = document.getElementById('countApproved');
  const countRejected = document.getElementById('countRejected');
  const countTotal = document.getElementById('countTotal');

  const displayAdminNameHeader = document.getElementById('displayAdminNameHeader');

  // Modal Elements
  const actionModal = document.getElementById('actionModal');
  const closeActionModalBtn = document.getElementById('closeActionModalBtn');
  const cancelActionBtn = document.getElementById('cancelActionBtn');
  const actionForm = document.getElementById('actionForm');

  const modalTitle = document.getElementById('modalTitle');
  const modalSuggestionId = document.getElementById('modalSuggestionId');
  const modalActionType = document.getElementById('modalActionType');
  const modalAuthorTag = document.getElementById('modalAuthorTag');
  const modalContentPreview = document.getElementById('modalContentPreview');
  const inputAdminName = document.getElementById('inputAdminName');
  const inputAdminNotes = document.getElementById('inputAdminNotes');
  const confirmActionBtn = document.getElementById('confirmActionBtn');

  // State
  let currentTab = 'PENDING'; // Default: PENDING (Sugestões Em Aberto)
  // Back button handling to return to Server Dashboard with guild parameter
  const urlParams = new URLSearchParams(window.location.search);
  const guildId = urlParams.get('guild') || urlParams.get('guildId') || localStorage.getItem('szlSelectedGuildId');
  const btnBackToServer = document.getElementById('btnBackToServer');
  if (btnBackToServer) {
    btnBackToServer.href = guildId ? `/server?guild=${guildId}` : '/server';
  }

  // Load User Details from API
  async function loadUser() {
    try {
      const response = await fetch('/api/user');
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await response.json();
      if (data.user) {
        const username = data.user.username;
        inputAdminName.value = username;
        if (displayAdminNameHeader) displayAdminNameHeader.textContent = username;
      }
    } catch (err) {
      console.error('Erro ao carregar perfil do usuário:', err);
    }
  }

  // -------------------------------------------------------------------------
  // 1. HAMBURGER MENU / SIDEBAR TOGGLE
  // -------------------------------------------------------------------------
  const toggleMobileMenu = () => {
    sidebar.classList.toggle('open');
    sidebarBackdrop.classList.toggle('hidden');
  };

  if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', toggleMobileMenu);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', toggleMobileMenu);

  // -------------------------------------------------------------------------
  // 2. TAB NAVIGATION SWITCHING
  // -------------------------------------------------------------------------
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');

      currentTab = item.getAttribute('data-tab');
      updateHeaderTitle(currentTab);
      fetchSuggestions();

      if (sidebar.classList.contains('open')) {
        toggleMobileMenu();
      }
    });
  });

  function updateHeaderTitle(tab) {
    switch (tab) {
      case 'PENDING':
        pageTitle.innerHTML = '💡 Sugestões Em Aberto';
        break;
      case 'APPROVED':
        pageTitle.innerHTML = '✅ Sugestões Aprovadas';
        break;
      case 'REJECTED':
        pageTitle.innerHTML = '❌ Sugestões Rejeitadas';
        break;
      case 'ALL':
        pageTitle.innerHTML = '📋 Todas as Sugestões';
        break;
    }
  }

  // -------------------------------------------------------------------------
  // 3. FETCH STATS & SUGGESTIONS FROM API
  // -------------------------------------------------------------------------
  async function fetchStats() {
    try {
      const res = await fetch('/api/suggestions/stats');
      const data = await res.json();

      if (data.success && data.stats) {
        const s = data.stats;
        statPendingCount.textContent = s.pending;
        statApprovedCount.textContent = s.approved;
        statRejectedCount.textContent = s.rejected;
        statTotalVotesCount.textContent = s.totalVotes;

        countPending.textContent = s.pending;
        countApproved.textContent = s.approved;
        countRejected.textContent = s.rejected;
        countTotal.textContent = s.total;
      }
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
    }
  }

  async function fetchSuggestions(silent = false) {
    if (!silent) {
      suggestionsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
          <i class="fa-solid fa-circle-notch fa-spin"></i> Carregando sugestões...
        </div>
      `;
    }

    try {
      const res = await fetch(`/api/suggestions?status=${currentTab}`);
      const data = await res.json();

      if (data.success) {
        suggestionsData = data.suggestions || [];
        renderSuggestions(suggestionsData);
      } else {
        suggestionsContainer.innerHTML = `
          <div style="text-align: center; color: #ef4444; padding: 40px;">
            <i class="fa-solid fa-triangle-exclamation"></i> ${data.error || 'Erro ao buscar sugestões.'}
          </div>
        `;
      }
    } catch (err) {
      console.error('Erro ao buscar sugestões:', err);
      suggestionsContainer.innerHTML = `
        <div style="text-align: center; color: #ef4444; padding: 40px;">
          <i class="fa-solid fa-wifi"></i> Erro de conexão com o servidor.
        </div>
      `;
    }
  }

  // -------------------------------------------------------------------------
  // 4. RENDER SUGGESTION CARDS
  // -------------------------------------------------------------------------
  function renderSuggestions(suggestions) {
    if (!suggestions || suggestions.length === 0) {
      let emptyMsg = 'Nenhuma sugestão encontrada.';
      if (currentTab === 'PENDING') emptyMsg = '🎉 Nenhuma sugestão em aberto no momento!';

      suggestionsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 40px; background: rgba(18,18,28,0.5); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
          <i class="fa-solid fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; color: var(--accent-color);"></i>
          ${emptyMsg}
        </div>
      `;
      return;
    }

    suggestionsContainer.innerHTML = '';
    suggestions.forEach(s => {
      const card = createSuggestionCard(s);
      suggestionsContainer.appendChild(card);
    });
  }

  function createSuggestionCard(s) {
    const card = document.createElement('div');
    card.className = `suggestion-card status-${s.status}`;

    const totalVotes = (s.supportCount || 0) + (s.rejectCount || 0);
    const upPercent = totalVotes > 0 ? Math.round((s.supportCount / totalVotes) * 100) : 50;

    let statusPillLabel = 'EM ABERTO';
    if (s.status === 'APPROVED') statusPillLabel = 'APROVADA';
    if (s.status === 'REJECTED') statusPillLabel = 'REJEITADA';

    const formattedDate = s.createdAt ? new Date(s.createdAt).toLocaleString('pt-BR') : '';

    let resolutionHtml = '';
    if (s.status !== 'PENDING') {
      const isApproved = s.status === 'APPROVED';
      resolutionHtml = `
        <div style="background: rgba(0,0,0,0.25); border-left: 3px solid ${isApproved ? '#10b981' : '#ef4444'}; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem;">
          <strong style="color: ${isApproved ? '#10b981' : '#ef4444'};">
            ${isApproved ? '✅ Aprovada' : '❌ Rejeitada'} por ${escapeHtml(s.resolvedBy || 'Moderador')}
          </strong>
          ${s.resolvedNotes ? `<p style="margin-top: 0.25rem; color: #cbd5e1;">💬 "${escapeHtml(s.resolvedNotes)}"</p>` : ''}
        </div>
      `;
    }

    let actionsHtml = '';
    if (s.status === 'PENDING') {
      actionsHtml = `
        <div class="card-actions">
          <button class="btn-action btn-reject btn-do-reject" data-id="${s.id}">
            <i class="fa-solid fa-thumbs-down"></i> Rejeitar
          </button>
          <button class="btn-action btn-approve btn-do-approve" data-id="${s.id}">
            <i class="fa-solid fa-thumbs-up"></i> Aprovar
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-top">
        <div class="author-info">
          <div class="author-avatar">${(s.authorTag || 'U').charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight: 700; color: #fff;">@${escapeHtml(s.authorTag)}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);"><i class="fa-regular fa-clock"></i> #${s.id} • ${formattedDate}</div>
          </div>
        </div>
        <span class="status-badge ${s.status}">${statusPillLabel}</span>
      </div>

      <div class="suggestion-content-box">
${escapeHtml(s.content)}
      </div>

      ${resolutionHtml}

      <div class="vote-bar-wrapper">
        <div class="vote-labels">
          <span style="color: #10b981;"><i class="fa-solid fa-thumbs-up"></i> Apoiar: ${s.supportCount}</span>
          <span style="color: #ef4444;"><i class="fa-solid fa-thumbs-down"></i> Recusar: ${s.rejectCount}</span>
        </div>
        <div class="vote-bar-bg" title="${upPercent}% de aprovação da comunidade">
          <div class="vote-bar-fill" style="width: ${upPercent}%"></div>
        </div>
      </div>

      ${actionsHtml}
    `;

    const btnApprove = card.querySelector('.btn-do-approve');
    const btnReject = card.querySelector('.btn-do-reject');

    if (btnApprove) btnApprove.addEventListener('click', () => openActionModal(s, 'approve'));
    if (btnReject) btnReject.addEventListener('click', () => openActionModal(s, 'reject'));

    return card;
  }

  // -------------------------------------------------------------------------
  // 5. DECISION MODAL LOGIC
  // -------------------------------------------------------------------------
  function openActionModal(suggestion, actionType) {
    modalSuggestionId.value = suggestion.id;
    modalActionType.value = actionType;

    modalAuthorTag.textContent = `@${suggestion.authorTag} • Proposta #${suggestion.id}`;
    modalContentPreview.textContent = suggestion.content;

    if (actionType === 'approve') {
      modalTitle.innerHTML = `<span style="color: #10b981;">👍 Aprovar Sugestão</span>`;
      confirmActionBtn.className = 'primary-btn';
      confirmActionBtn.innerHTML = `<span>Confirmar Aprovação</span>`;
    } else {
      modalTitle.innerHTML = `<span style="color: #ef4444;">👎 Rejeitar Sugestão</span>`;
      confirmActionBtn.className = 'secondary-btn';
      confirmActionBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
      confirmActionBtn.style.color = '#fff';
      confirmActionBtn.innerHTML = `<span>Confirmar Rejeição</span>`;
    }

    inputAdminNotes.value = '';
    actionModal.classList.remove('hidden');
  }

  function closeModal() {
    actionModal.classList.add('hidden');
  }

  if (closeActionModalBtn) closeActionModalBtn.addEventListener('click', closeModal);
  if (cancelActionBtn) cancelActionBtn.addEventListener('click', closeModal);
  if (actionModal) {
    actionModal.addEventListener('click', (e) => {
      if (e.target === actionModal) closeModal();
    });
  }

  actionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = modalSuggestionId.value;
    const action = modalActionType.value;
    const adminName = inputAdminName.value.trim() || 'Moderador';
    const adminNotes = inputAdminNotes.value.trim();

    confirmActionBtn.disabled = true;

    try {
      const res = await fetch(`/api/suggestions/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName, adminNotes })
      });

      const data = await res.json();

      if (data.success) {
        closeModal();
        await fetchStats();
        await fetchSuggestions();
      } else {
        alert(`Erro: ${data.error || 'Não foi possível processar a ação.'}`);
      }
    } catch (err) {
      console.error('Erro ao enviar decisão:', err);
      alert('Erro de conexão ao processar decisão.');
    } finally {
      confirmActionBtn.disabled = false;
    }
  });

  // -------------------------------------------------------------------------
  // 6. EVENT REFRESH LISTENERS & AUTO-RELOAD
  // -------------------------------------------------------------------------
  if (btnRefreshSuggestions) {
    btnRefreshSuggestions.addEventListener('click', () => {
      btnRefreshSuggestions.style.transform = 'rotate(180deg)';
      setTimeout(() => btnRefreshSuggestions.style.transform = 'rotate(0deg)', 300);
      
      fetchStats();
      fetchSuggestions();
    });
  }

  // Auto-reload a cada 15 segundos
  setInterval(() => {
    // Recarrega de forma silenciosa apenas se o modal estiver fechado
    if (actionModal.classList.contains('hidden')) {
      fetchStats();
      fetchSuggestions(true);
    }
  }, 15000);

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial Load
  loadUser();
  fetchStats();
  fetchSuggestions();
});
