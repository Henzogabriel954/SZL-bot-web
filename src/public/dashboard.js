document.addEventListener('DOMContentLoaded', () => {
  const serversGrid = document.getElementById('serversGrid');
  const userProfile = document.getElementById('userProfile');
  const userAvatar = document.getElementById('userAvatar');
  const userTag = document.getElementById('userTag');

  // Alterna menu suspenso de logout ao clicar no avatar do usuário
  if (userProfile) {
    userProfile.addEventListener('click', (e) => {
      if (e.target.closest('.logout-btn')) return;
      e.stopPropagation();
      userProfile.classList.toggle('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (userProfile && !userProfile.contains(e.target)) {
      userProfile.classList.remove('open');
    }
  });

  // --- Carrega dados do Usuário Logado ---
  async function loadUser() {
    try {
      const response = await fetch('/api/user');
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await response.json();
      if (data.user) {
        if (data.user.avatar) {
          userAvatar.src = `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=64`;
        } else {
          userAvatar.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
        userTag.textContent = data.user.username;
        userProfile.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Erro ao carregar dados do usuário:', err);
    }
  }

  // --- Carrega a lista de servidores em comum com o bot ---
  async function loadGuilds() {
    try {
      const response = await fetch('/api/guilds');
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await response.json();
      
      serversGrid.innerHTML = '';
      
      if (data.guilds && data.guilds.length > 0) {
        data.guilds.forEach(g => {
          const card = document.createElement('a');
          card.className = 'server-card card-blur';
          card.href = `/server?guild=${g.id}`;

          // Gera elemento de ícone (ou iniciais caso não tenha ícone)
          let iconHtml = '';
          if (g.icon) {
            iconHtml = `<img class="server-icon-large" src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128" alt="${g.name}">`;
          } else {
            const initials = g.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
            iconHtml = `<div class="server-icon-large">${initials}</div>`;
          }

          card.innerHTML = `
            ${iconHtml}
            <div class="server-details">
              <h4 title="${g.name}">${g.name}</h4>
              <span>Configurar Bot ➔</span>
            </div>
          `;
          
          serversGrid.appendChild(card);
        });
      } else {
        serversGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 12px; color: var(--text-secondary);">
            ❌ Nenhum servidor com o bot ativo encontrado onde você seja administrador.
          </div>
        `;
      }
    } catch (err) {
      console.error('Erro ao carregar servidores:', err);
      serversGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--danger-color);">
          Erro ao carregar lista de servidores. O backend do bot está ativo?
        </div>
      `;
    }
  }

  loadUser();
  loadGuilds();
});
