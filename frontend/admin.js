// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// JAVASCRIPT DO PAINEL ADMINISTRATIVO (admin.js)
// ============================================================================

(function () {
  'use strict';

  // Elementos do DOM
  const leadsTbody = document.getElementById('leads-tbody');
  const emptyState = document.getElementById('empty-state');
  const leadsCounter = document.getElementById('leads-counter');
  const btnRefresh = document.getElementById('btn-refresh');
  const searchInput = document.getElementById('search-input');
  const filterService = document.getElementById('filter-service');

  // KPIs
  const kpiTotalLeads = document.getElementById('kpi-total-leads');
  const kpiTotalFaturamento = document.getElementById('kpi-total-faturamento');
  const kpiTicketMedio = document.getElementById('kpi-ticket-medio');
  const kpiTopServico = document.getElementById('kpi-top-servico');

  let allLeads = [];

  /**
   * Busca leads da Edge Function e mescla com leads em cache local
   */
  async function carregarLeads() {
    leadsCounter.textContent = 'Carregando leads do Supabase...';
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
   * Atualiza os cartões de indicadores no topo da tela
   */
  function atualizarKpis(leads) {
    const total = leads.length;
    kpiTotalLeads.textContent = total;

    if (total === 0) {
      kpiTotalFaturamento.textContent = 'R$ 0,00';
      kpiTicketMedio.textContent = 'R$ 0,00';
      kpiTopServico.textContent = '-';
      return;
    }

    const faturamento = leads.reduce((acc, lead) => acc + (Number(lead.valor_calculado) || 0), 0);
    const media = faturamento / total;

    kpiTotalFaturamento.textContent = faturamento.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    kpiTicketMedio.textContent = media.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

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
            ? 'Parede c/ Textura'
            : srv === 'teto'
            ? 'Teto'
            : srv;
      }
    }

    kpiTopServico.textContent = `${topServico} (${maxQtd})`;
  }

  /**
   * Renderiza a tabela aplicando busca e filtros
   */
  function renderizarTabela() {
    const busca = (searchInput.value || '').toLowerCase().trim();
    const filtro = filterService.value;

    const leadsFiltrados = allLeads.filter((lead) => {
      const matchBusca =
        !busca ||
        (lead.nome || '').toLowerCase().includes(busca) ||
        (lead.telefone || '').toLowerCase().includes(busca);

      const matchFiltro =
        filtro === 'todos' || (lead.tipo_servico || '').toLowerCase().includes(filtro);

      return matchBusca && matchFiltro;
    });

    leadsCounter.textContent = `${leadsFiltrados.length} lead(s) exibido(s)`;
    leadsTbody.innerHTML = '';

    if (leadsFiltrados.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    leadsFiltrados.forEach((lead) => {
      const tr = document.createElement('tr');

      const dataObj = lead.created_at ? new Date(lead.created_at) : new Date();
      const dataFormatada = dataObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const nomeServico =
        lead.tipo_servico === 'parede_textura'
          ? 'Parede c/ Textura'
          : lead.tipo_servico === 'teto'
          ? 'Teto'
          : 'Parede Lisa';

      const classeBadge =
        lead.tipo_servico === 'parede_textura'
          ? 'textura'
          : lead.tipo_servico === 'teto'
          ? 'teto'
          : '';

      const valorFormatado = Number(lead.valor_calculado || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });

      // Formatar link do WhatsApp (somente números)
      const foneLimpo = (lead.telefone || '').replace(/\D/g, '');
      const foneComPais = foneLimpo.startsWith('55') ? foneLimpo : `55${foneLimpo}`;
      const msgPadrao = encodeURIComponent(
        `Olá ${lead.nome}! Sou o Valdir Pintor. Vi que você fez um orçamento no meu site para ${nomeServico}. Como posso te ajudar?`
      );
      const urlWhats = `https://wa.me/${foneComPais}?text=${msgPadrao}`;

      tr.innerHTML = `
        <td style="color: var(--text-dim); font-size: 0.82rem;">${dataFormatada}</td>
        <td class="client-name">${escapeHtml(lead.nome || 'Cliente')}</td>
        <td>
          <span style="font-family: monospace; color: #93c5fd;">${escapeHtml(lead.telefone || '')}</span>
        </td>
        <td>
          <span class="badge-service ${classeBadge}">${nomeServico}</span>
        </td>
        <td style="text-align: center; font-weight: 600;">${lead.quantidade_comodos}</td>
        <td class="lead-price">${valorFormatado}</td>
        <td>
          <a href="${urlWhats}" target="_blank" rel="noopener" class="btn-whatsapp" title="Abrir conversa no WhatsApp">
            <span>WhatsApp</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
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

  // Listeners
  btnRefresh.addEventListener('click', carregarLeads);
  searchInput.addEventListener('input', renderizarTabela);
  filterService.addEventListener('change', renderizarTabela);

  // Carga inicial
  carregarLeads();
})();
