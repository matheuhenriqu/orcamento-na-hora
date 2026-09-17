// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// JAVASCRIPT DO PAINEL ADMINISTRATIVO COM AUTENTICAÇÃO SUPABASE AUTH (admin.js)
// PADRÃO HIGH-CONTRAST MODERN SAAS / SWISS INDUSTRIAL
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // ELEMENTOS DE AUTENTICAÇÃO & GESTÃO DE USUÁRIOS
  // ==========================================================================
  const loginGate = document.getElementById('login-gate');
  const adminDashboard = document.getElementById('admin-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginErrorText = document.getElementById('login-error-text');
  const btnLogout = document.getElementById('btn-logout');

  // Indicador de Usuário no Header
  const activeUserName = document.getElementById('active-user-name');
  const activeUserRole = document.getElementById('active-user-role');

  // Modal de Gestão de Usuários
  const btnOpenUsersModal = document.getElementById('btn-open-users-modal');
  const btnCloseUsersModal = document.getElementById('btn-close-users-modal');
  const usersModal = document.getElementById('users-modal');
  const modalTabList = document.getElementById('modal-tab-list');
  const modalTabAdd = document.getElementById('modal-tab-add');
  const modalSecList = document.getElementById('modal-sec-list');
  const modalSecAdd = document.getElementById('modal-sec-add');
  const usersTbody = document.getElementById('users-tbody');
  const modalUsersCount = document.getElementById('modal-users-count');
  const modalUserForm = document.getElementById('modal-user-form');
  const modalRegNome = document.getElementById('modal-reg-nome');
  const modalRegEmail = document.getElementById('modal-reg-email');
  const modalRegCargo = document.getElementById('modal-reg-cargo');
  const modalRegPassword = document.getElementById('modal-reg-password');
  const btnCancelAddUser = document.getElementById('btn-cancel-add-user');
  const modalUserFeedback = document.getElementById('modal-user-feedback');
  const modalUserFeedbackMsg = document.getElementById('modal-user-feedback-msg');

  // Elementos do Dashboard
  const leadsTbody = document.getElementById('leads-tbody');
  const emptyState = document.getElementById('empty-state');
  const leadsCounter = document.getElementById('leads-counter');
  const btnRefresh = document.getElementById('btn-refresh');
  const searchInput = document.getElementById('search-input');
  const filterService = document.getElementById('filter-service');
  const filterPillsContainer = document.getElementById('filter-pills-container');
  const currentDateBadge = document.getElementById('current-date-badge');

  // KPIs
  const kpiTotalLeads = document.getElementById('kpi-total-leads');
  const kpiTotalFaturamento = document.getElementById('kpi-total-faturamento');
  const kpiTicketMedio = document.getElementById('kpi-ticket-medio');
  const kpiTopServico = document.getElementById('kpi-top-servico');

  let allLeads = [];

  // Exibir a data corrente no header corporativo
  if (currentDateBadge) {
    const hoje = new Date();
    currentDateBadge.textContent = hoje.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // ==========================================================================
  // 1. GERENCIAMENTO DE AUTENTICAÇÃO E SESSÃO (SUPABASE AUTH REAL - A1)
  // ==========================================================================
  function atualizarBadgeUsuarioAtivo(user) {
    if (user) {
      if (activeUserName) activeUserName.textContent = user.nome || user.email || 'Operador';
      if (activeUserRole) {
        const cargoMap = { admin: 'Administrador', atendente: 'Atendente', pintor: 'Pintor' };
        activeUserRole.textContent = cargoMap[user.role] || user.role || 'Operador';
      }
    } else {
      if (activeUserName) activeUserName.textContent = 'Operador';
      if (activeUserRole) activeUserRole.textContent = 'Acesso Restrito';
    }
  }

  function mostrarErroLogin(msg) {
    if (!loginError) return;
    if (loginErrorText) loginErrorText.textContent = msg;
    loginError.classList.remove('hidden');
  }

  /**
   * Validação rigorosa de autenticação (A1):
   * Depende exclusivamente de sessão válida e verificada no Supabase Auth via getUser().
   * Tentativas de burlar via `sessionStorage.setItem('admin_auth', 'true')` no console
   * não têm efeito, pois esta chave NÃO é utilizada para liberar acesso.
   */
  async function verificarAutenticacao() {
    if (!window.AdminAuth) {
      console.error('[admin] Módulo AdminAuth não carregado.');
      return;
    }

    const user = await window.AdminAuth.getUser();

    if (user) {
      loginGate.classList.add('hidden');
      adminDashboard.classList.remove('hidden');
      atualizarBadgeUsuarioAtivo(user);
      await carregarLeads();
    } else {
      adminDashboard.classList.add('hidden');
      loginGate.classList.remove('hidden');
      if (loginEmail) {
        setTimeout(() => loginEmail.focus(), 50);
      }
    }
  }

  // Submissão do Formulário de Login com Proteção contra Força Bruta
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = (loginEmail?.value || '').trim();
      const senha = (loginPassword?.value || '').trim();

      if (!email || !senha) {
        mostrarErroLogin('Preencha os campos de e-mail e senha para acessar.');
        return;
      }

      const btnSubmit = document.getElementById('btn-login-submit');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.classList.add('loading');
      }

      try {
        await window.AdminAuth.signInWithPassword(email, senha);
        loginError.classList.add('hidden');
        if (loginPassword) loginPassword.value = '';
        await verificarAutenticacao();
      } catch (err) {
        mostrarErroLogin(err.message || 'Credenciais inválidas. Verifique os dados informados.');
        if (loginPassword) {
          loginPassword.value = '';
          loginPassword.focus();
        }
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.classList.remove('loading');
        }
      }
    });
  }

  // Logout com invalidação server-side
  if (btnLogout) {
    btnLogout.addEventListener('click', async function () {
      if (window.AdminAuth) {
        await window.AdminAuth.signOut();
      }
      if (loginEmail) loginEmail.value = '';
      if (loginPassword) loginPassword.value = '';
      loginError.classList.add('hidden');
      await verificarAutenticacao();
    });
  }

  // ==========================================================================
  // 2. MODAL DE GESTÃO DE OPERADORES NO DASHBOARD (ADMIN REAL - A2)
  // ==========================================================================
  function abrirModalUsuarios() {
    if (usersModal) {
      usersModal.classList.remove('hidden');
      mostrarSecaoModal('list');
      renderizarListaUsuarios();
    }
  }

  function fecharModalUsuarios() {
    if (usersModal) {
      usersModal.classList.add('hidden');
      if (modalUserForm) modalUserForm.reset();
      limparFeedbackModal();
    }
  }

  function mostrarSecaoModal(secao) {
    if (secao === 'list') {
      if (modalTabList) modalTabList.classList.add('active');
      if (modalTabAdd) modalTabAdd.classList.remove('active');
      if (modalSecList) modalSecList.classList.remove('hidden');
      if (modalSecAdd) modalSecAdd.classList.add('hidden');
      renderizarListaUsuarios();
    } else {
      if (modalTabAdd) modalTabAdd.classList.add('active');
      if (modalTabList) modalTabList.classList.remove('active');
      if (modalSecAdd) modalSecAdd.classList.remove('hidden');
      if (modalSecList) modalSecList.classList.add('hidden');
      limparFeedbackModal();
      if (modalRegNome) setTimeout(() => modalRegNome.focus(), 50);
    }
  }

  function exibirFeedbackModal(tipo, msg) {
    if (!modalUserFeedback || !modalUserFeedbackMsg) return;
    modalUserFeedback.className = `login-feedback-box ${tipo}`;
    modalUserFeedbackMsg.textContent = msg;
    modalUserFeedback.classList.remove('hidden');
  }

  function limparFeedbackModal() {
    if (!modalUserFeedback) return;
    modalUserFeedback.classList.add('hidden');
    modalUserFeedback.className = 'login-feedback-box hidden';
    if (modalUserFeedbackMsg) modalUserFeedbackMsg.textContent = '';
  }

  /**
   * Consulta a lista de operadores registrados no backend
   */
  async function renderizarListaUsuarios() {
    const token = window.AdminAuth?.getToken();
    if (!token) return;

    if (!usersTbody) return;
    usersTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 16px; color: var(--text-muted);">Carregando operadores...</td></tr>';

    try {
      const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/salvar-lead`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': window.APP_CONFIG.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list_users' }),
      });

      if (!resp.ok) {
        usersTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 16px; color: var(--accent-danger);">Não foi possível carregar a lista de operadores.</td></tr>';
        return;
      }

      const data = await resp.json();
      const users = data.users || [];
      const userAtivo = window.AdminAuth?.getSession()?.user;

      if (modalUsersCount) modalUsersCount.textContent = users.length;
      usersTbody.innerHTML = '';

      if (users.length === 0) {
        usersTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 16px; color: var(--text-muted);">Nenhum operador adicional cadastrado.</td></tr>';
        return;
      }

      users.forEach((u) => {
        const tr = document.createElement('tr');
        const dataObj = u.created_at ? new Date(u.created_at) : new Date();
        const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        const roleClass =
          u.role === 'admin'
            ? 'role-admin'
            : u.role === 'atendente'
            ? 'role-atendente'
            : 'role-pintor';

        const cargoLabel =
          u.role === 'admin'
            ? 'Administrador'
            : u.role === 'atendente'
            ? 'Atendente'
            : 'Pintor';

        const isCurrent = userAtivo && (userAtivo.id === u.id || userAtivo.email === u.email);

        tr.innerHTML = `
          <td>
            <span class="font-mono font-semibold">${escapeHtml(u.email || u.id)}</span>
            ${isCurrent ? '<span style="font-size: 0.68rem; color: var(--brand-primary); font-weight: 600; margin-left: 4px;">(você)</span>' : ''}
          </td>
          <td>${escapeHtml(u.nome || u.email)}</td>
          <td>
            <span class="badge-role ${roleClass}">${escapeHtml(cargoLabel)}</span>
          </td>
          <td class="font-mono text-muted text-xs">${dataFormatada}</td>
          <td style="text-align: right;">
            <button
              type="button"
              class="btn-delete-user"
              data-id="${escapeHtml(u.id)}"
              data-email="${escapeHtml(u.email || '')}"
              ${isCurrent ? 'disabled title="Não é possível excluir a própria conta logada"' : 'title="Remover operador"'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Excluir</span>
            </button>
          </td>
        `;

        usersTbody.appendChild(tr);
      });

      // Eventos de exclusão de operador
      usersTbody.querySelectorAll('.btn-delete-user:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', function () {
          const userId = this.getAttribute('data-id');
          const userEmail = this.getAttribute('data-email');
          if (userId) {
            excluirOperador(userId, userEmail);
          }
        });
      });
    } catch (e) {
      console.warn('[admin] Erro ao listar usuários:', e);
      usersTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 16px; color: var(--accent-danger);">Erro de comunicação com o servidor.</td></tr>';
    }
  }

  async function excluirOperador(userId, userEmail) {
    if (!confirm(`Confirma a exclusão definitiva do acesso do operador "${userEmail || userId}"?`)) {
      return;
    }

    const token = window.AdminAuth?.getToken();
    if (!token) return;

    try {
      const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/salvar-lead`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': window.APP_CONFIG.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'delete_user', user_id: userId }),
      });

      const res = await resp.json().catch(() => ({}));
      if (resp.ok && res.success) {
        alert('Operador removido com sucesso.');
        renderizarListaUsuarios();
      } else {
        alert(res.error || 'Erro ao remover operador.');
      }
    } catch (err) {
      alert('Erro de conexão ao remover operador.');
    }
  }

  // Listeners do Modal de Usuários
  if (btnOpenUsersModal) btnOpenUsersModal.addEventListener('click', abrirModalUsuarios);
  if (btnCloseUsersModal) btnCloseUsersModal.addEventListener('click', fecharModalUsuarios);
  if (modalTabList) modalTabList.addEventListener('click', () => mostrarSecaoModal('list'));
  if (modalTabAdd) modalTabAdd.addEventListener('click', () => mostrarSecaoModal('add'));
  if (btnCancelAddUser) btnCancelAddUser.addEventListener('click', () => mostrarSecaoModal('list'));

  if (usersModal) {
    usersModal.addEventListener('click', (e) => {
      if (e.target === usersModal) fecharModalUsuarios();
    });
  }

  // Cadastro de novo operador via modal com validação de política de senha
  if (modalUserForm) {
    modalUserForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const nome = (modalRegNome?.value || '').trim();
      const email = (modalRegEmail?.value || '').trim().toLowerCase();
      const cargo = (modalRegCargo?.value || 'Atendente').trim();
      const pass = (modalRegPassword?.value || '').trim();

      if (!nome || !email || !pass) {
        exibirFeedbackModal('error', 'Preencha todos os campos do formulário.');
        return;
      }

      // Validação estrita da política de senhas (min 12 caracteres + complexidade - A2)
      const avaliacao = window.AdminAuth?.avaliarComplexidadeSenha(pass);
      if (avaliacao && !avaliacao.isValid) {
        exibirFeedbackModal('error', `Requisitos de senha não atendidos: ${avaliacao.errors.join(' ')}`);
        return;
      }

      const roleMapeada =
        cargo === 'Administrador'
          ? 'admin'
          : cargo === 'Atendente'
          ? 'atendente'
          : 'pintor';

      const token = window.AdminAuth?.getToken();
      if (!token) return;

      try {
        const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/salvar-lead`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': window.APP_CONFIG.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create_user',
            email,
            password: pass,
            nome,
            role: roleMapeada,
          }),
        });

        const res = await resp.json().catch(() => ({}));
        if (resp.ok && res.success) {
          exibirFeedbackModal('success', res.message || 'Operador cadastrado com sucesso!');
          modalUserForm.reset();
          setTimeout(() => {
            mostrarSecaoModal('list');
          }, 1000);
        } else {
          exibirFeedbackModal('error', res.error || res.message || 'Erro ao cadastrar operador.');
        }
      } catch (err) {
        exibirFeedbackModal('error', 'Falha ao conectar com o servidor para criar o usuário.');
      }
    });
  }

  // ==========================================================================
  // 3. BUSCA E PROCESSAMENTO DE LEADS (COM JWT REAL - A3)
  // ==========================================================================
  async function carregarLeads() {
    const token = window.AdminAuth?.getToken();
    if (!token) return;

    leadsCounter.textContent = 'Sincronizando com Supabase...';
    if (btnRefresh) btnRefresh.classList.add('loading');
    let remoteLeads = [];

    try {
      const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/salvar-lead`;
      // A3: Envia JWT de autenticação real do Supabase Auth e remove headers bypass legados
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': window.APP_CONFIG.SUPABASE_ANON_KEY,
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        remoteLeads = data.leads || [];
      } else if (resp.status === 401) {
        console.warn('[admin] Sessão expirada ou não autorizada ao carregar leads (401).');
        await window.AdminAuth?.signOut();
        await verificarAutenticacao();
        return;
      }
    } catch (err) {
      console.warn('Não foi possível conectar ao endpoint remoto de leads:', err);
    } finally {
      if (btnRefresh) btnRefresh.classList.remove('loading');
    }

    // Mesclar com leads em cache do localStorage para visualização imediata
    let localLeads = [];
    try {
      localLeads = JSON.parse(localStorage.getItem('orcamento_local_leads') || '[]');
    } catch {
      localLeads = [];
    }

    // Deduplicação por id ou combinação nome+telefone
    const leadMap = new Map();
    [...remoteLeads, ...localLeads].forEach((item) => {
      const key = item.id || `${item.nome}_${item.telefone}`;
      if (!leadMap.has(key)) {
        leadMap.set(key, item);
      }
    });

    allLeads = Array.from(leadMap.values()).sort((a, b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return db - da;
    });

    atualizarKpis(allLeads);
    renderizarTabela();
  }

  // ==========================================================================
  // 4. ATUALIZAÇÃO DE KPIS E RENDERIZAÇÃO DA TABELA
  // ==========================================================================
  function atualizarKpis(leads) {
    const total = leads.length;
    let faturamento = 0;
    const servicosCont = {};

    leads.forEach((l) => {
      const v = parseFloat(l.valor_calculado || l.valor_final || 0);
      if (!isNaN(v)) faturamento += v;

      const serv = l.tipo_servico || 'Outro';
      servicosCont[serv] = (servicosCont[serv] || 0) + 1;
    });

    const ticketMedio = total > 0 ? faturamento / total : 0;

    let topServico = '—';
    let maxCont = 0;
    for (const [serv, count] of Object.entries(servicosCont)) {
      if (count > maxCont) {
        maxCont = count;
        topServico = serv;
      }
    }

    const mapaServicos = {
      parede_lisa: 'Parede Lisa',
      parede_textura: 'Textura',
      teto: 'Teto',
    };

    if (kpiTotalLeads) kpiTotalLeads.textContent = total;
    if (kpiTotalFaturamento) {
      kpiTotalFaturamento.textContent = `R$ ${faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (kpiTicketMedio) {
      kpiTicketMedio.textContent = `R$ ${ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (kpiTopServico) {
      kpiTopServico.textContent = mapaServicos[topServico] || topServico;
    }
  }

  function renderizarTabela() {
    const termo = (searchInput?.value || '').toLowerCase().trim();
    const filtro = filterService?.value || 'todos';

    const leadsFiltrados = allLeads.filter((l) => {
      const matchTermo =
        !termo ||
        (l.nome && l.nome.toLowerCase().includes(termo)) ||
        (l.telefone && l.telefone.includes(termo));

      const matchFiltro = filtro === 'todos' || l.tipo_servico === filtro;
      return matchTermo && matchFiltro;
    });

    leadsCounter.textContent = `${leadsFiltrados.length} orçamento(s) localizado(s)`;

    if (leadsFiltrados.length === 0) {
      leadsTbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    leadsTbody.innerHTML = '';

    leadsFiltrados.forEach((lead) => {
      const tr = document.createElement('tr');

      const dataObj = lead.created_at ? new Date(lead.created_at) : new Date();
      const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const horaFormatada = dataObj.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      let nomeServico = 'Parede Lisa';
      let classeBadge = 'badge-parede-lisa';

      if (lead.tipo_servico === 'parede_textura') {
        nomeServico = 'Textura';
        classeBadge = 'badge-textura';
      } else if (lead.tipo_servico === 'teto') {
        nomeServico = 'Teto';
        classeBadge = 'badge-teto';
      }

      const valorNum = parseFloat(lead.valor_calculado || lead.valor_final || 0);
      const valorFormatado = `R$ ${valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const telLimpo = (lead.telefone || '').replace(/\D/g, '');
      const msgWhats = encodeURIComponent(
        `Olá ${lead.nome || 'Cliente'}, aqui é da equipe de atendimento do Valdir Pinturas sobre seu orçamento de ${nomeServico}!`
      );
      const urlWhats = `https://wa.me/55${telLimpo}?text=${msgWhats}`;

      tr.innerHTML = `
        <td class="font-mono text-muted text-xs">
          <div>${dataFormatada}</div>
          <div style="opacity: 0.7;">${horaFormatada}</div>
        </td>
        <td>
          <span class="client-name">${escapeHtml(lead.nome || 'Cliente')}</span>
        </td>
        <td>
          <span class="font-mono text-secondary">${escapeHtml(lead.telefone || 'Não informado')}</span>
        </td>
        <td>
          <span class="badge-service ${classeBadge}">${nomeServico}</span>
        </td>
        <td style="text-align: center;" class="font-mono font-semibold">${lead.quantidade_comodos}</td>
        <td style="text-align: right;" class="font-mono font-bold text-emerald">${valorFormatado}</td>
        <td style="text-align: right;">
          <a href="${urlWhats}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-solid" title="Iniciar atendimento via WhatsApp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z"/>
            </svg>
            <span>Conversar no WhatsApp</span>
          </a>
        </td>
      `;

      leadsTbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Interatividade com os Filter Pills
  if (filterPillsContainer) {
    filterPillsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;

      filterPillsContainer.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');

      const filterVal = btn.getAttribute('data-filter');
      if (filterService) {
        filterService.value = filterVal;
      }
      renderizarTabela();
    });
  }

  // Listeners do Dashboard
  if (btnRefresh) btnRefresh.addEventListener('click', carregarLeads);
  if (searchInput) searchInput.addEventListener('input', renderizarTabela);
  if (filterService) filterService.addEventListener('change', renderizarTabela);

  // Inicialização: checa autenticação imediatamente via Supabase Auth
  verificarAutenticacao();
})();
