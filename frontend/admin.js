// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// JAVASCRIPT DO PAINEL ADMINISTRATIVO COM AUTENTICAÇÃO (admin.js)
// PADRÃO HIGH-CONTRAST MODERN SAAS / SWISS INDUSTRIAL
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // ELEMENTOS DE AUTENTICAÇÃO, CADASTRO & GESTÃO DE USUÁRIOS
  // ==========================================================================
  const loginGate = document.getElementById('login-gate');
  const adminDashboard = document.getElementById('admin-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginErrorText = document.getElementById('login-error-text');
  const btnLogout = document.getElementById('btn-logout');

  // Abas e Formulário de Cadastro na Tela de Entrada
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const btnGotoRegister = document.getElementById('btn-goto-register');
  const btnGotoLogin = document.getElementById('btn-goto-login');
  const registerForm = document.getElementById('register-form');
  const registerFeedback = document.getElementById('register-feedback');
  const registerFeedbackIcon = document.getElementById('register-feedback-icon');
  const registerFeedbackMsg = document.getElementById('register-feedback-msg');
  const regNome = document.getElementById('reg-nome');
  const regUsername = document.getElementById('reg-username');
  const regCargo = document.getElementById('reg-cargo');
  const regPassword = document.getElementById('reg-password');
  const regPasswordConfirm = document.getElementById('reg-password-confirm');

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
  const modalRegUsername = document.getElementById('modal-reg-username');
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

  // Chave de armazenamento persistente no LocalStorage
  const USERS_STORAGE_KEY = 'orcamento_admin_users';

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
  // 1. GERENCIAMENTO DE USUÁRIOS & PERSISTÊNCIA (LOCALSTORAGE)
  // ==========================================================================
  function carregarUsuarios() {
    let users = [];
    try {
      users = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '[]');
    } catch {
      users = [];
    }

    // Garantir que a conta master oficial (admin/admin) sempre exista como âncora
    const temMaster = users.some((u) => (u.username || '').toLowerCase() === 'admin');
    if (!temMaster) {
      users.unshift({
        id: 'usr_master_valdir',
        nome: 'Valdir Pintor (Master)',
        username: 'admin',
        password: 'admin',
        cargo: 'Administrador',
        created_at: '2026-09-15T00:00:00.000Z',
        isMaster: true,
      });
      salvarUsuarios(users);
    }
    return users;
  }

  function salvarUsuarios(users) {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (err) {
      console.error('Erro ao gravar usuários no LocalStorage:', err);
    }
  }

  function cadastrarUsuario({ nome, username, cargo, password }) {
    const nomeLimpo = (nome || '').trim();
    const userLimpo = (username || '').trim().toLowerCase();
    const cargoLimpo = (cargo || 'Administrador').trim();
    const passLimpo = (password || '').trim();

    if (!nomeLimpo || !userLimpo || !passLimpo) {
      return { success: false, message: 'Preencha todos os campos obrigatórios.' };
    }

    // Validação de formato do nome de usuário
    if (userLimpo.length < 3) {
      return { success: false, message: 'O nome de usuário deve ter no mínimo 3 caracteres.' };
    }

    if (!/^[a-z0-9_.-]+$/.test(userLimpo)) {
      return { success: false, message: 'O usuário deve conter apenas letras, números, ponto ou underline.' };
    }

    if (passLimpo.length < 4) {
      return { success: false, message: 'A senha deve conter no mínimo 4 caracteres.' };
    }

    const users = carregarUsuarios();
    const duplicado = users.some((u) => (u.username || '').toLowerCase() === userLimpo);
    if (duplicado) {
      return { success: false, message: `O usuário "${userLimpo}" já está cadastrado. Escolha outro.` };
    }

    const novoUsuario = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nome: nomeLimpo,
      username: userLimpo,
      cargo: cargoLimpo,
      password: passLimpo,
      created_at: new Date().toISOString(),
      isMaster: false,
    };

    users.push(novoUsuario);
    salvarUsuarios(users);

    return {
      success: true,
      message: `Usuário "${userLimpo}" cadastrado com sucesso!`,
      user: novoUsuario,
    };
  }

  function autenticarUsuario(username, password) {
    const userLimpo = (username || '').trim().toLowerCase();
    const passLimpo = (password || '').trim();

    const users = carregarUsuarios();
    const usuarioEncontrado = users.find(
      (u) => (u.username || '').toLowerCase() === userLimpo && u.password === passLimpo
    );

    return usuarioEncontrado || null;
  }

  function estaAutenticado() {
    return sessionStorage.getItem('admin_auth') === 'true';
  }

  function obterUsuarioAtivo() {
    try {
      return JSON.parse(sessionStorage.getItem('admin_user') || 'null');
    } catch {
      return null;
    }
  }

  function definirUsuarioAtivo(user) {
    sessionStorage.setItem('admin_auth', 'true');
    sessionStorage.setItem(
      'admin_user',
      JSON.stringify({
        id: user.id,
        nome: user.nome,
        username: user.username,
        cargo: user.cargo,
        isMaster: user.isMaster || false,
      })
    );
  }

  function atualizarBadgeUsuarioAtivo() {
    const user = obterUsuarioAtivo();
    if (user) {
      if (activeUserName) activeUserName.textContent = user.nome || user.username;
      if (activeUserRole) activeUserRole.textContent = user.cargo || 'Operador';
    } else {
      if (activeUserName) activeUserName.textContent = 'Admin';
      if (activeUserRole) activeUserRole.textContent = 'Master';
    }
  }

  // ==========================================================================
  // 2. TELA DE LOGIN & CADASTRO (LOGIN GATE)
  // ==========================================================================
  function mostrarTabLogin() {
    if (tabLogin) {
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
    }
    if (tabRegister) {
      tabRegister.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'false');
    }
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (loginError) loginError.classList.add('hidden');
  }

  function mostrarTabCadastro() {
    if (tabRegister) {
      tabRegister.classList.add('active');
      tabRegister.setAttribute('aria-selected', 'true');
    }
    if (tabLogin) {
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');
    }
    if (registerForm) registerForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
    limparFeedbackCadastro();
    if (regNome) setTimeout(() => regNome.focus(), 50);
  }

  function exibirFeedbackCadastro(tipo, msg) {
    if (!registerFeedback || !registerFeedbackMsg) return;
    registerFeedback.className = `login-feedback-box ${tipo}`;
    registerFeedbackMsg.textContent = msg;
    registerFeedback.classList.remove('hidden');
  }

  function limparFeedbackCadastro() {
    if (!registerFeedback) return;
    registerFeedback.classList.add('hidden');
    registerFeedback.className = 'login-feedback-box hidden';
    if (registerFeedbackMsg) registerFeedbackMsg.textContent = '';
  }

  function mostrarErroLogin(msg) {
    if (!loginError) return;
    if (loginErrorText) loginErrorText.textContent = msg;
    loginError.classList.remove('hidden');
  }

  function verificarAutenticacao() {
    if (estaAutenticado()) {
      loginGate.classList.add('hidden');
      adminDashboard.classList.remove('hidden');
      atualizarBadgeUsuarioAtivo();
      carregarLeads();
    } else {
      adminDashboard.classList.add('hidden');
      loginGate.classList.remove('hidden');
      mostrarTabLogin();
      if (loginUsername) {
        setTimeout(() => loginUsername.focus(), 50);
      }
    }
  }

  // Listeners de alternância de abas no login gate
  if (tabLogin) tabLogin.addEventListener('click', mostrarTabLogin);
  if (tabRegister) tabRegister.addEventListener('click', mostrarTabCadastro);
  if (btnGotoRegister) btnGotoRegister.addEventListener('click', mostrarTabCadastro);
  if (btnGotoLogin) btnGotoLogin.addEventListener('click', mostrarTabLogin);

  // Submissão do Formulário de Login
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const usuario = (loginUsername.value || '').trim();
      const senha = (loginPassword.value || '').trim();

      if (!usuario || !senha) {
        mostrarErroLogin('Preencha os campos de usuário e senha para acessar.');
        return;
      }

      const userAutenticado = autenticarUsuario(usuario, senha);
      if (userAutenticado) {
        loginError.classList.add('hidden');
        definirUsuarioAtivo(userAutenticado);
        loginPassword.value = '';
        verificarAutenticacao();
      } else {
        mostrarErroLogin('Credenciais inválidas. Verifique o usuário e a senha.');
        loginPassword.value = '';
        loginPassword.focus();
      }
    });
  }

  // Submissão do Formulário de Cadastro na Tela Inicial
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const nome = (regNome.value || '').trim();
      const username = (regUsername.value || '').trim();
      const cargo = (regCargo.value || 'Administrador').trim();
      const pass = (regPassword.value || '').trim();
      const passConf = (regPasswordConfirm.value || '').trim();

      if (!nome || !username || !pass || !passConf) {
        exibirFeedbackCadastro('error', 'Preencha todos os campos do formulário.');
        return;
      }

      if (pass !== passConf) {
        exibirFeedbackCadastro('error', 'As senhas não coincidem. Digite novamente.');
        regPasswordConfirm.value = '';
        regPasswordConfirm.focus();
        return;
      }

      const resultado = cadastrarUsuario({ nome, username, cargo, password: pass });
      if (resultado.success) {
        exibirFeedbackCadastro('success', `${resultado.message} Redirecionando para login...`);
        registerForm.reset();
        setTimeout(() => {
          mostrarTabLogin();
          if (loginUsername) loginUsername.value = username;
          if (loginPassword) {
            loginPassword.value = '';
            loginPassword.focus();
          }
        }, 1200);
      } else {
        exibirFeedbackCadastro('error', resultado.message);
      }
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      sessionStorage.removeItem('admin_auth');
      sessionStorage.removeItem('admin_user');
      if (loginUsername) loginUsername.value = '';
      if (loginPassword) loginPassword.value = '';
      loginError.classList.add('hidden');
      verificarAutenticacao();
    });
  }

  // ==========================================================================
  // 3. MODAL DE GESTÃO DE USUÁRIOS NO DASHBOARD
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

  function renderizarListaUsuarios() {
    const users = carregarUsuarios();
    const userAtivo = obterUsuarioAtivo();

    if (modalUsersCount) modalUsersCount.textContent = users.length;
    if (!usersTbody) return;

    usersTbody.innerHTML = '';
    users.forEach((u) => {
      const tr = document.createElement('tr');
      const dataObj = u.created_at ? new Date(u.created_at) : new Date();
      const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      const roleClass =
        u.cargo === 'Administrador'
          ? 'role-admin'
          : u.cargo === 'Atendente'
          ? 'role-atendente'
          : 'role-pintor';

      const isCurrent = userAtivo && userAtivo.username.toLowerCase() === (u.username || '').toLowerCase();
      const isMaster = u.isMaster || (u.username || '').toLowerCase() === 'admin';

      tr.innerHTML = `
        <td>
          <span class="font-mono font-semibold">${escapeHtml(u.username)}</span>
          ${isCurrent ? '<span style="font-size: 0.68rem; color: var(--brand-primary); font-weight: 600; margin-left: 4px;">(você)</span>' : ''}
        </td>
        <td>${escapeHtml(u.nome || u.username)}</td>
        <td>
          <span class="badge-role ${roleClass}">${escapeHtml(u.cargo || 'Operador')}</span>
        </td>
        <td class="font-mono text-muted text-xs">${dataFormatada}</td>
        <td style="text-align: right;">
          <button
            type="button"
            class="btn-delete-user"
            data-username="${escapeHtml(u.username)}"
            ${isMaster || isCurrent ? 'disabled title="Conta protegida contra exclusão"' : 'title="Remover acesso deste usuário"'}
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

    // Eventos de exclusão de usuário
    usersTbody.querySelectorAll('.btn-delete-user:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', function () {
        const usernameParaExcluir = this.getAttribute('data-username');
        if (usernameParaExcluir) {
          excluirUsuario(usernameParaExcluir);
        }
      });
    });
  }

  function excluirUsuario(username) {
    const userAtivo = obterUsuarioAtivo();
    if (userAtivo && userAtivo.username.toLowerCase() === username.toLowerCase()) {
      alert('Não é possível excluir a conta atualmente conectada.');
      return;
    }
    if (username.toLowerCase() === 'admin') {
      alert('A conta de administrador raiz não pode ser excluída.');
      return;
    }

    if (!confirm(`Confirma a exclusão definitiva do usuário "${username}"?`)) {
      return;
    }

    let users = carregarUsuarios();
    users = users.filter((u) => (u.username || '').toLowerCase() !== username.toLowerCase());
    salvarUsuarios(users);
    renderizarListaUsuarios();
  }

  // Listeners do Modal de Usuários
  if (btnOpenUsersModal) btnOpenUsersModal.addEventListener('click', abrirModalUsuarios);
  if (btnCloseUsersModal) btnCloseUsersModal.addEventListener('click', fecharModalUsuarios);
  if (modalTabList) modalTabList.addEventListener('click', () => mostrarSecaoModal('list'));
  if (modalTabAdd) modalTabAdd.addEventListener('click', () => mostrarSecaoModal('add'));
  if (btnCancelAddUser) btnCancelAddUser.addEventListener('click', () => mostrarSecaoModal('list'));

  // Fechar modal ao clicar fora do card
  if (usersModal) {
    usersModal.addEventListener('click', (e) => {
      if (e.target === usersModal) fecharModalUsuarios();
    });
  }

  // Cadastro de novo usuário via modal
  if (modalUserForm) {
    modalUserForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const nome = (modalRegNome.value || '').trim();
      const username = (modalRegUsername.value || '').trim();
      const cargo = (modalRegCargo.value || 'Administrador').trim();
      const pass = (modalRegPassword.value || '').trim();

      if (!nome || !username || !pass) {
        exibirFeedbackModal('error', 'Preencha todos os campos do formulário.');
        return;
      }

      const res = cadastrarUsuario({ nome, username, cargo, password: pass });
      if (res.success) {
        exibirFeedbackModal('success', res.message);
        modalUserForm.reset();
        setTimeout(() => {
          mostrarSecaoModal('list');
        }, 900);
      } else {
        exibirFeedbackModal('error', res.message);
      }
    });
  }

  // ==========================================================================
  // 4. BUSCA E PROCESSAMENTO DE LEADS
  // ==========================================================================
  async function carregarLeads() {
    if (!estaAutenticado()) return;

    leadsCounter.textContent = 'Sincronizando com Supabase...';
    if (btnRefresh) btnRefresh.classList.add('loading');
    let remoteLeads = [];

    try {
      const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/salvar-lead`;
      const resp = await fetch(url, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        remoteLeads = data.leads || [];
      }
    } catch (err) {
      console.warn('Não foi possível conectar ao endpoint remoto de leads:', err);
    } finally {
      if (btnRefresh) btnRefresh.classList.remove('loading');
    }

    // Mesclar com leads em cache do localStorage (para contingência e sincronia instantânea)
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

  /**
   * Atualiza os cartões de indicadores (KPIs)
   */
  function atualizarKpis(leads) {
    const total = leads.length;
    if (kpiTotalLeads) kpiTotalLeads.textContent = total;

    if (total === 0) {
      if (kpiTotalFaturamento) kpiTotalFaturamento.textContent = 'R$ 0,00';
      if (kpiTicketMedio) kpiTicketMedio.textContent = 'R$ 0,00';
      if (kpiTopServico) kpiTopServico.textContent = 'Nenhum lead';
      return;
    }

    const faturamento = leads.reduce((acc, lead) => acc + (Number(lead.valor_calculado) || 0), 0);
    const media = faturamento / total;

    if (kpiTotalFaturamento) {
      kpiTotalFaturamento.textContent = faturamento.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }

    if (kpiTicketMedio) {
      kpiTicketMedio.textContent = media.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    }

    // Contagem do serviço mais solicitado
    const servicoCount = {};
    leads.forEach((l) => {
      const s = l.tipo_servico || 'outros';
      servicoCount[s] = (servicoCount[s] || 0) + 1;
    });

    let topServico = '-';
    let maxQtd = 0;
    for (const [srv, qtd] of Object.entries(servicoCount)) {
      if (qtd > maxQtd) {
        maxQtd = qtd;
        topServico =
          srv === 'parede_lisa'
            ? 'Parede Lisa'
            : srv === 'parede_textura'
            ? 'Textura'
            : srv === 'teto'
            ? 'Teto'
            : srv;
      }
    }

    if (kpiTopServico) {
      kpiTopServico.textContent = `${topServico} (${maxQtd})`;
    }
  }

  /**
   * Renderiza a tabela aplicando busca e filtros
   */
  function renderizarTabela() {
    const busca = (searchInput && searchInput.value || '').toLowerCase().trim();
    const filtro = filterService ? filterService.value : 'todos';

    const leadsFiltrados = allLeads.filter((lead) => {
      const matchBusca =
        !busca ||
        (lead.nome || '').toLowerCase().includes(busca) ||
        (lead.telefone || '').toLowerCase().includes(busca);

      const matchFiltro =
        filtro === 'todos' || (lead.tipo_servico || '').toLowerCase().includes(filtro);

      return matchBusca && matchFiltro;
    });

    if (leadsCounter) {
      leadsCounter.textContent = `${leadsFiltrados.length} ${leadsFiltrados.length === 1 ? 'registro' : 'registros'}`;
    }

    if (!leadsTbody) return;
    leadsTbody.innerHTML = '';

    if (leadsFiltrados.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    leadsFiltrados.forEach((lead) => {
      const tr = document.createElement('tr');

      const dataObj = lead.created_at ? new Date(lead.created_at) : new Date();
      const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
      const horaFormatada = dataObj.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const nomeServico =
        lead.tipo_servico === 'parede_textura'
          ? 'Textura'
          : lead.tipo_servico === 'teto'
          ? 'Teto'
          : 'Parede Lisa';

      const classeBadge =
        lead.tipo_servico === 'parede_textura'
          ? 'textura'
          : lead.tipo_servico === 'teto'
          ? 'teto'
          : 'parede-lisa';

      const valorFormatado = Number(lead.valor_calculado || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });

      // Formatar link do WhatsApp (somente números)
      const foneLimpo = (lead.telefone || '').replace(/\D/g, '');
      const foneComPais = foneLimpo.startsWith('55') ? foneLimpo : `55${foneLimpo}`;
      const msgPadrao = encodeURIComponent(
        `Olá ${lead.nome}! Sou o Valdir Pintor. Vi sua cotação oficial no site para ${nomeServico} (${lead.quantidade_comodos} cômodos no valor de ${valorFormatado}). Podemos agendar a visita?`
      );
      const urlWhats = `https://wa.me/${foneComPais}?text=${msgPadrao}`;

      tr.innerHTML = `
        <td class="font-mono text-muted text-xs">
          <div>${dataFormatada}</div>
          <div style="font-size: 0.72rem; color: #a1a1aa;">${horaFormatada}</div>
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

  // Inicialização: checa autenticação imediatamente
  verificarAutenticacao();
})();
