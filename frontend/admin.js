// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// JAVASCRIPT DO PAINEL ADMINISTRATIVO COM AUTENTICAÇÃO (admin.js)
// PADRÃO HIGH-CONTRAST MODERN SAAS / SWISS INDUSTRIAL
// ============================================================================

(function () {
  'use strict';

  // Elementos de Autenticação / Gate
  const loginGate = document.getElementById('login-gate');
  const adminDashboard = document.getElementById('admin-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const btnLogout = document.getElementById('btn-logout');

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
  // 1. FLUXO DE AUTENTICAÇÃO (LOGIN GATE & SESSÃO)
  // ==========================================================================
  function estaAutenticado() {
    return sessionStorage.getItem('admin_auth') === 'true';
  }

  function verificarAutenticacao() {
    if (estaAutenticado()) {
      loginGate.classList.add('hidden');
      adminDashboard.classList.remove('hidden');
      carregarLeads();
    } else {
      adminDashboard.classList.add('hidden');
      loginGate.classList.remove('hidden');
      if (loginUsername) {
        setTimeout(() => loginUsername.focus(), 50);
      }
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const usuario = (loginUsername.value || '').trim();
      const senha = (loginPassword.value || '').trim();

      // Credenciais oficiais: admin / admin
      if (usuario === 'admin' && senha === 'admin') {
        loginError.classList.add('hidden');
        sessionStorage.setItem('admin_auth', 'true');
        loginPassword.value = '';
        verificarAutenticacao();
      } else {
        loginError.classList.remove('hidden');
        loginPassword.value = '';
        loginPassword.focus();
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      sessionStorage.removeItem('admin_auth');
      if (loginUsername) loginUsername.value = '';
      if (loginPassword) loginPassword.value = '';
      loginError.classList.add('hidden');
      verificarAutenticacao();
    });
  }

  // ==========================================================================
  // 2. BUSCA E PROCESSAMENTO DE LEADS
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
