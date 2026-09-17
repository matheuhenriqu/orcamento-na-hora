// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// CLIENTE JAVASCRIPT (VANILLA JS) PARA CHAT & RENDERIZAÇÃO VISUAL
// ============================================================================

(function () {
  'use strict';

  // Elementos do DOM
  const messagesContainer = document.getElementById('messages-container');
  const chatForm = document.getElementById('chat-form');
  const userInput = document.getElementById('user-input');
  const btnSend = document.getElementById('btn-send');
  const typingIndicator = document.getElementById('typing-indicator');
  const quickChips = document.querySelectorAll('.chip');
  const btnRestart = document.getElementById('btn-restart');
  const btnConfig = document.getElementById('btn-config');

  // Modal de Configuração
  const configModal = document.getElementById('config-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnSaveConfig = document.getElementById('btn-save-config');
  const inputFunctionsUrl = document.getElementById('input-functions-url');
  const inputAnonKey = document.getElementById('input-anon-key');
  const checkDemoMode = document.getElementById('check-demo-mode');
  const charCounter = document.getElementById('char-counter');
  const btnCancelAi = document.getElementById('btn-cancel-ai');

  // Controle assíncrono e cancelamento (C5)
  let abortController = null;
  let typingTimeoutId = null;
  let lastUserMessageText = '';
  let lastFocusedElement = null;

  // Histórico de Mensagens no formato OpenAI/Groq
  let conversationHistory = [];

  // Estado da conversa para modo de contingência/demo
  const localContext = {
    ultimoOrcamento: null,
  };

  // ==========================================================================
  // HELPERS DE CONTRATO PREVISÍVEL (C1) & TOASTS/MODAIS ACESSÍVEIS (M1)
  // ==========================================================================

  /**
   * Helper parseChat(res) para contrato previsível { ok: true, data } / { ok: false, error }
   */
  function parseChat(res) {
    if (!res) return { ok: false, reply: '', toolAction: null };

    // Novo contrato padronizado: { ok: true, data: { reply, toolAction } }
    if (res.ok === true && res.data) {
      return {
        ok: true,
        reply: res.data.reply || '',
        toolAction: res.data.toolAction || res.data.tool_action || null,
        meta: res.meta,
      };
    }

    // Compatibilidade com aliases legados
    if (res.reply !== undefined || res.tool_action !== undefined || res.orcamento !== undefined || res.lead !== undefined) {
      return {
        ok: true,
        reply: res.reply || '',
        toolAction: res.tool_action || (res.orcamento ? { type: 'orcamento_calculado', data: res.orcamento } : null),
        meta: res.meta,
      };
    }

    // Contrato de erro: { ok: false, error: { code, message, action, requestId } }
    if (res.ok === false && res.error) {
      return {
        ok: false,
        error: res.error,
      };
    }

    return {
      ok: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Resposta desconhecida recebida do servidor.',
        action: 'Tente reenviar a mensagem.',
      },
    };
  }

  /**
   * Sistema de Toasts Acessíveis (WCAG 2.2 AA)
   */
  function showToast(type, msg, action = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const item = document.createElement('div');
    item.className = `toast-item toast-${type || 'info'}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const textSpan = document.createElement('span');
    textSpan.textContent = msg;
    item.appendChild(textSpan);

    if (action && action.label && typeof action.onClick === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action-btn';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', () => {
        action.onClick();
        item.remove();
      });
      item.appendChild(actionBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', 'Fechar notificação');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => item.remove());
    item.appendChild(closeBtn);

    container.appendChild(item);

    setTimeout(() => {
      if (item.parentNode) item.remove();
    }, 5000);
  }

  /**
   * Modal de Confirmação Acessível (substitui window.confirm e window.alert)
   */
  function confirmModal({ title = 'Confirmação', desc = 'Deseja continuar?', danger = false } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      if (!modal) {
        resolve(true);
        return;
      }

      const titleEl = document.getElementById('confirm-modal-title');
      const descEl = document.getElementById('confirm-modal-desc');
      const btnCancel = document.getElementById('btn-confirm-cancel');
      const btnConfirm = document.getElementById('btn-confirm-action');
      const btnClose = document.getElementById('btn-confirm-close');

      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = desc;

      if (btnConfirm) {
        btnConfirm.className = danger ? 'btn-danger-action' : 'btn-primary';
      }

      const prevFocus = document.activeElement;
      modal.classList.remove('hidden');
      if (btnConfirm) btnConfirm.focus();

      function cleanup(result) {
        modal.classList.add('hidden');
        document.removeEventListener('keydown', handleKeydown);
        if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
        resolve(result);
      }

      function handleKeydown(e) {
        if (e.key === 'Escape') {
          cleanup(false);
        }
      }

      document.addEventListener('keydown', handleKeydown);

      if (btnCancel) btnCancel.onclick = () => cleanup(false);
      if (btnClose) btnClose.onclick = () => cleanup(false);
      if (btnConfirm) btnConfirm.onclick = () => cleanup(true);
      modal.onclick = (e) => {
        if (e.target === modal) cleanup(false);
      };
    });
  }

  // Exportar helpers para escopo global para testes e verificações
  window.parseChat = parseChat;
  window.showToast = showToast;
  window.confirmModal = confirmModal;

  // ==========================================================================
  // 1. INICIALIZAÇÃO DO CHAT
  // ==========================================================================
  function initChat() {
    conversationHistory = [];
    localContext.ultimoOrcamento = null;
    messagesContainer.innerHTML = '';

    const mensagemInicial = 
      `Olá! Seja bem-vindo ao atendimento oficial de **Valdir Pintura & Acabamentos**.\n\n` +
      `Trabalhamos com preços oficiais fixos por cômodo:\n` +
      `• **Parede lisa:** R$ 120,00 por cômodo\n` +
      `• **Parede com textura:** R$ 180,00 por cômodo\n` +
      `• **Teto:** R$ 100,00 por cômodo\n\n` +
      `*Desconto automático de 10% aplicado para 5 ou mais cômodos.*\n\n` +
      `Qual serviço você gostaria de orçar e em quantos cômodos?`;

    appendMessage('assistant', mensagemInicial);
  }

  // ==========================================================================
  // 2. RENDERIZAÇÃO DE MENSAGENS E CARDS
  // ==========================================================================

  /**
   * Sanitiza respostas da IA removendo blocos sintéticos de tool_call,
   * tags <think> e vazamento de parâmetros no balão de texto.
   */
  function sanitizeAIText(str) {
    if (!str) return '';

    // Se o texto contiver padrão evidente de vazamento de parâmetros ou preâmbulo técnico observado em produção
    if (/quantidade_comodos|Agora vou registrar/i.test(str)) {
      return '';
    }

    return str
      // Remove tags de raciocínio de modelos DeepSeek/Qwen
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      // Remove blocos de tool call sintéticos
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      // Remove tags sintéticas estilo <function=...>...</function>
      .replace(/<function[=\s][\s\S]*?<\/function>/gi, '')
      // Remove tags soltas sintéticas
      .replace(/<\/?(?:tool_call|tool_response|function|think)[^>]*>/gi, '')
      // Remove vazamento explícito de parâmetros (ex: quantidade_comodos> 5 540.00)
      .replace(/(?:quantidade_comodos|comodos|tipo_servico|valor_total)\s*>\s*[\d.\s]+/gi, '')
      .replace(/(?:salvar_lead|confirmar_agendamento|calcular_orcamento)\s*\([^\)]*\)/gi, '')
      .replace(/\{"name":\s*"(?:salvar_lead|confirmar_agendamento|calcular_orcamento)"[\s\S]*?\}/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function appendMessage(role, text, toolAction = null) {
    const isUser = role === 'user';
    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user-row' : 'bot-row'}`;

    const avatar = document.createElement('div');
    avatar.className = `avatar-small ${isUser ? 'avatar-user' : 'avatar-bot'}`;
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = isUser
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Se for mensagem da IA, sanitiza o texto para remover qualquer vazamento de tool calls ou parâmetros
    let formattedText = text;
    if (!isUser) {
      formattedText = sanitizeAIText(text);
      if (!formattedText.trim()) {
        if (toolAction && toolAction.type === 'lead_salvo') {
          const leadObj = (toolAction.data && toolAction.data.lead) || toolAction.data || {};
          const nome = leadObj.nome || 'Cliente';
          const fone = leadObj.telefone || '';
          formattedText = `Perfeito, ${nome}! Seus dados foram encaminhados diretamente ao Telegram do pintor Valdir. Ele entrará em contato com você pelo seu WhatsApp (${fone}) para combinar a data e o início dos trabalhos.`;
        } else if (toolAction && toolAction.type === 'orcamento_calculado') {
          formattedText = `Aqui está a sua proposta oficial calculada conforme nossa tabela de preços:`;
        } else {
          formattedText = `Como posso te ajudar com o orçamento da sua pintura hoje?`;
        }
      }
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = formatMarkdown(formattedText);

    contentDiv.appendChild(bubble);

    // Se houver ação de ferramenta (Tool Calling), renderizar o card especial correspondente
    if (toolAction) {
      if (toolAction.type === 'orcamento_calculado') {
        const card = createOrcamentoCard(toolAction.data);
        contentDiv.appendChild(card);
      } else if (toolAction.type === 'lead_salvo') {
        const card = createLeadCard(toolAction.data);
        contentDiv.appendChild(card);
      }
    }

    const agora = new Date();
    const timeStr = agora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeEl = document.createElement('time');
    timeEl.className = 'message-time';
    timeEl.dateTime = agora.toISOString();
    timeEl.textContent = timeStr;

    // Acessibilidade: anuncia remetente e horário no leitor de tela (C4)
    row.setAttribute('aria-label', `${isUser ? 'Você' : 'Valdir'} às ${timeStr}`);
    contentDiv.appendChild(timeEl);

    row.appendChild(avatar);
    row.appendChild(contentDiv);

    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  /**
   * Codifica caracteres especiais para entidades HTML seguras, prevenindo XSS.
   */
  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Converte marcações simples de Markdown com escape seguro de HTML
   */
  function formatMarkdown(str) {
    if (!str) return '';
    // Escapa caracteres HTML para evitar injeção de scripts e tags indesejadas
    const safe = escapeHtml(str);

    return safe
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/•\s*(.*)/g, '• $1')
      .replace(/\n/g, '<br>');
  }

  /**
   * Cria o CARD DE ORÇAMENTO (FATURA / PROPOSTA COMERCIAL FORMAL)
   */
  function createOrcamentoCard(data) {
    const card = document.createElement('div');
    card.className = 'orcamento-card';

    const nomeServico = data.nome_servico || (
      data.tipo_servico === 'parede_textura' ? 'Parede com Textura' :
      data.tipo_servico === 'teto' ? 'Teto' : 'Parede Lisa'
    );

    const valorUnitario = Number(data.preco_unitario || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const valorTotal = Number(data.valor_total || data.valor_final || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const subtotalFormatado = Number(data.subtotal || data.valor_total || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const descontoLinha = data.desconto_aplicado > 0
      ? `<div class="orcamento-calc-row discount-row">
          <span>Desconto por Volume (10%):</span>
          <span class="font-mono text-emerald">- ${Number(data.desconto_aplicado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
         </div>`
      : '';

    const taxaVisitaLinha = data.taxa_visita
      ? `<div class="orcamento-calc-row fee-row">
          <span>Taxa de Deslocamento / Visita Técnica:</span>
          <span class="font-mono">+ R$ 30,00</span>
         </div>`
      : '';

    card.innerHTML = `
      <div class="orcamento-header">
        <div class="orcamento-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Proposta Comercial Formal</span>
        </div>
        <span class="orcamento-protocol">Tabela Oficial Valdir</span>
      </div>

      <div class="invoice-summary-table">
        <div class="invoice-line">
          <span class="invoice-label">Item / Serviço</span>
          <span class="invoice-value font-semibold">${escapeHtml(nomeServico)}</span>
        </div>
        <div class="invoice-line">
          <span class="invoice-label">Quantidade</span>
          <span class="invoice-value font-mono">${data.quantidade_comodos} cômodo(s)</span>
        </div>
        <div class="invoice-line">
          <span class="invoice-label">Tarifa Unitária</span>
          <span class="invoice-value font-mono">${valorUnitario} / cômodo</span>
        </div>
        <div class="invoice-line">
          <span class="invoice-label">Subtotal Bruto</span>
          <span class="invoice-value font-mono">${subtotalFormatado}</span>
        </div>
      </div>

      ${descontoLinha || taxaVisitaLinha ? `
        <div class="invoice-adjustments">
          ${descontoLinha}
          ${taxaVisitaLinha}
        </div>
      ` : ''}

      <div class="orcamento-total-box">
        <div>
          <span class="total-title">VALOR FINAL DA PROPOSTA</span>
          <p class="total-subtitle">Preço fechado sem taxas ocultas</p>
        </div>
        <div class="total-number font-mono">${valorTotal}</div>
      </div>

      <div class="orcamento-cta-prompt">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
        <span>Para agendar este serviço, <strong>informe seu Nome e WhatsApp</strong> abaixo.</span>
      </div>
    `;

    return card;
  }

  /**
   * Cria o CARD DE CONFIRMAÇÃO DO LEAD (AGENDAMENTO SOLICITADO)
   */
  function createLeadCard(data) {
    const card = document.createElement('div');
    card.className = 'lead-card';

    // Descompacta dados do lead suportando payload direto ou aninhado
    const leadObj = (data && data.lead) ? data.lead : (data || {});
    const nome = leadObj.nome || data.nome || 'Cliente';
    const telefone = leadObj.telefone || data.telefone || '';
    const tipoServico = leadObj.tipo_servico || data.tipo_servico || 'parede_lisa';
    const comodos = Number(leadObj.comodos || leadObj.quantidade_comodos || data.comodos || data.quantidade_comodos || 1);
    const valorNum = Number(leadObj.valor_total || leadObj.valor_calculado || data.valor_total || data.valor_calculado || 0);

    // Sincronizar lead com cache local para o painel administrativo
    try {
      const savedLeads = JSON.parse(localStorage.getItem('orcamento_local_leads') || '[]');
      const novoLead = {
        id: data.lead_id || leadObj.id || crypto.randomUUID(),
        nome: nome,
        telefone: telefone,
        tipo_servico: tipoServico,
        quantidade_comodos: comodos,
        valor_calculado: valorNum,
        created_at: new Date().toISOString(),
      };
      savedLeads.unshift(novoLead);
      localStorage.setItem('orcamento_local_leads', JSON.stringify(savedLeads));
    } catch (e) {
      console.warn('Erro ao cachear lead localmente:', e);
    }

    const valorFormatado = valorNum.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const nomeServico = tipoServico === 'parede_textura' ? 'Parede com Textura' :
      tipoServico === 'teto' ? 'Teto' : 'Parede Lisa';

    card.innerHTML = `
      <div class="lead-header">
        <span class="lead-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Agendamento Solicitado
        </span>
        <span class="lead-subtag">Enviado ao Telegram</span>
      </div>

      <div class="lead-details-table">
        <div class="lead-detail-row">
          <span class="lead-detail-label">Cliente Responsável</span>
          <span class="lead-detail-val font-semibold">${escapeHtml(nome)}</span>
        </div>
        <div class="lead-detail-row">
          <span class="lead-detail-label">WhatsApp / Contato</span>
          <span class="lead-detail-val font-mono">${escapeHtml(telefone || 'Informado no atendimento')}</span>
        </div>
        <div class="lead-detail-row">
          <span class="lead-detail-label">Serviço Aprovado</span>
          <span class="lead-detail-val">${escapeHtml(nomeServico)} (${comodos} cômodo${comodos > 1 ? 's' : ''})</span>
        </div>
        <div class="lead-detail-row">
          <span class="lead-detail-label">Valor do Orçamento</span>
          <span class="lead-detail-val font-mono text-emerald font-bold">${escapeHtml(valorFormatado)}</span>
        </div>
      </div>

      <div class="lead-status-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        <div>
          <strong>Notificação enviada ao Telegram do pintor Valdir</strong>
          <p>Seus dados foram encaminhados diretamente ao Telegram do pintor Valdir. Ele entrará em contato com você pelo seu WhatsApp para combinar a data e o início dos trabalhos.</p>
        </div>
      </div>
    `;

    return card;
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Renderiza card de erro amigável no chat com retry e ação corretiva (C2)
   */
  function renderChatErrorCard({ status, code, message, technicalDetails, originalText }) {
    const row = document.createElement('div');
    row.className = 'message-row bot-row error-row';
    row.setAttribute('role', 'alert');
    row.setAttribute('aria-label', 'Erro no processamento');

    const avatar = document.createElement('div');
    avatar.className = 'avatar-small avatar-bot';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const card = document.createElement('div');
    card.className = 'chat-error-card';

    let title = 'Erro no atendimento';
    let friendlyMsg = message;
    const is400 = status === 400 || code === 'VALIDATION_ERROR';
    const is429 = status === 429 || code === 'RATE_LIMITED';
    const is5xx = (status >= 500 && status < 600) || code === 'GROQ_UNAVAILABLE' || code === 'INTERNAL_ERROR';
    const isOffline = status === 0 || code === 'NETWORK_OFFLINE' || code === 'TypeError';
    const isCancelled = code === 'USER_CANCELLED';
    const isTimeout = code === 'TIMEOUT_20S';

    if (is400) {
      title = 'Não entendi sua solicitação';
      friendlyMsg = 'Não entendi. Exemplo: "2 cômodos parede lisa". Você pode clicar no exemplo abaixo:';
    } else if (is429) {
      title = 'Muitas mensagens';
      friendlyMsg = 'Muitas mensagens. Aguarde 30s para enviar uma nova pergunta.';
    } else if (is5xx) {
      title = 'IA instável';
      friendlyMsg = 'O serviço do assistente de inteligência artificial está temporariamente instável. Tente reenviar agora.';
    } else if (isCancelled) {
      title = 'Atendimento cancelado';
      friendlyMsg = 'O cálculo ou resposta foi cancelado por você.';
    } else if (isTimeout) {
      title = 'Tempo limite excedido';
      friendlyMsg = 'O assistente demorou mais de 20s para responder. Verifique sua conexão e tente novamente.';
    } else if (isOffline) {
      title = 'Sem internet';
      friendlyMsg = 'Sem conexão com a internet ou servidor inacessível. Verifique sua rede e tente novamente.';
    }

    let html = `
      <div class="chat-error-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>${escapeHtml(title)}</span>
      </div>
      <p class="chat-error-msg">${escapeHtml(friendlyMsg)}</p>
      <div class="chat-error-actions">
    `;

    if (is400) {
      html += `
        <button type="button" class="chat-error-example-chip" data-example="2 cômodos parede lisa">
          💡 "2 cômodos parede lisa"
        </button>
      `;
    }

    if (is429) {
      html += `
        <button type="button" class="btn-retry-chat" id="btn-retry-429" disabled>
          <span class="countdown-label">Aguarde 30s...</span>
        </button>
      `;
    } else {
      html += `
        <button type="button" class="btn-retry-chat btn-retry-action">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          <span>Tentar de novo</span>
        </button>
      `;
    }
    html += `</div>`;

    if (technicalDetails) {
      html += `
        <details class="chat-error-details">
          <summary>Detalhes técnicos</summary>
          <pre>${escapeHtml(technicalDetails)}</pre>
        </details>
      `;
    }

    card.innerHTML = html;
    contentDiv.appendChild(card);
    row.appendChild(avatar);
    row.appendChild(contentDiv);
    messagesContainer.appendChild(row);
    scrollToBottom();

    // Contador regressivo para 429 (C2)
    if (is429) {
      const retryBtn = card.querySelector('#btn-retry-429');
      let countdown = 30;
      const timer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
          const lbl = retryBtn?.querySelector('.countdown-label');
          if (lbl) lbl.textContent = `Aguarde ${countdown}s...`;
        } else {
          clearInterval(timer);
          if (retryBtn) {
            retryBtn.disabled = false;
            retryBtn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
              <span>Tentar de novo</span>
            `;
            retryBtn.addEventListener('click', () => {
              row.remove();
              reenviarMensagem(originalText);
            });
          }
        }
      }, 1000);
    }

    // Botão de retry padrão (C2)
    const retryBtn = card.querySelector('.btn-retry-action');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        row.remove();
        reenviarMensagem(originalText);
      });
    }

    // Chip de exemplo clicável (400)
    const exampleChip = card.querySelector('.chat-error-example-chip');
    if (exampleChip) {
      exampleChip.addEventListener('click', () => {
        const sampleText = exampleChip.getAttribute('data-example');
        row.remove();
        reenviarMensagem(sampleText);
      });
    }
  }

  function reenviarMensagem(text) {
    if (!text) return;
    userInput.value = text;
    chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  /**
   * Controle de digitação cancelável com timeout de 20s (C5)
   */
  function setTyping(isTyping) {
    if (isTyping) {
      typingIndicator.classList.remove('hidden');
      typingIndicator.setAttribute('aria-busy', 'true');
      userInput.disabled = true;
      userInput.setAttribute('data-prev-placeholder', userInput.placeholder);
      userInput.placeholder = "Valdir está digitando...";
      btnSend.disabled = true;
      btnSend.classList.add('loading');
      scrollToBottom();

      // Timeout preventivo de 20s para liberar UI (C5)
      if (typingTimeoutId) clearTimeout(typingTimeoutId);
      typingTimeoutId = setTimeout(() => {
        if (abortController) {
          abortController.abort(new Error('TIMEOUT_20S'));
        }
      }, 20000);
    } else {
      if (typingTimeoutId) {
        clearTimeout(typingTimeoutId);
        typingTimeoutId = null;
      }
      abortController = null;
      typingIndicator.classList.add('hidden');
      typingIndicator.setAttribute('aria-busy', 'false');
      userInput.disabled = false;
      userInput.placeholder = userInput.getAttribute('data-prev-placeholder') || "Digite o serviço e a quantidade de cômodos...";
      btnSend.disabled = false;
      btnSend.classList.remove('loading');
      userInput.focus();
    }
  }

  // Botão de cancelamento da IA (C5)
  if (btnCancelAi) {
    btnCancelAi.addEventListener('click', () => {
      if (abortController) {
        abortController.abort(new Error('USER_CANCELLED'));
      }
    });
  }

  // ==========================================================================
  // 3. ENVIO DE MENSAGENS E COMUNICAÇÃO COM O BACKEND
  // ==========================================================================
  chatForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;

    lastUserMessageText = text;
    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });
    userInput.value = '';
    if (charCounter) {
      charCounter.textContent = '0/140';
      charCounter.className = 'char-counter';
    }

    setTyping(true);

    try {
      if (window.APP_CONFIG.DEMO_MODE) {
        await handleOfflineDemo(text);
      } else {
        await sendToSupabaseEdgeFunction(text);
      }
    } catch (err) {
      console.error('Erro na chamada da Edge Function:', err);
      let status = 0;
      let code = 'NETWORK_OFFLINE';
      let message = err.message || 'Erro ao processar mensagem.';
      let technicalDetails = `URL: ${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/chat\nErro: ${err.message}`;

      if (err.name === 'AbortError' || err.message === 'USER_CANCELLED' || err.message === 'TIMEOUT_20S') {
        if (err.message === 'TIMEOUT_20S' || (err.message && err.message.includes('TIMEOUT_20S'))) {
          code = 'TIMEOUT_20S';
          message = 'O assistente demorou mais de 20s para responder.';
        } else {
          code = 'USER_CANCELLED';
          message = 'Atendimento cancelado pelo usuário.';
        }
      } else if (err.status) {
        status = err.status;
        code = err.code || (status === 400 ? 'VALIDATION_ERROR' : status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR');
        message = err.friendlyMessage || err.message;
        technicalDetails = `Status: ${status}\nCódigo: ${code}\nDetalhes: ${err.details || err.message}`;
      } else if (err instanceof TypeError) {
        status = 0;
        code = 'NETWORK_OFFLINE';
        message = 'Sem conexão com a internet ou servidor inacessível.';
      }

      renderChatErrorCard({
        status,
        code,
        message,
        technicalDetails,
        originalText: lastUserMessageText,
      });
    } finally {
      setTyping(false);
    }
  });

  /**
   * Envia o histórico de mensagens para a Edge Function /chat com Idempotency-Key (M2)
   */
  async function sendToSupabaseEdgeFunction(userMsgText = '') {
    const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/chat`;
    const idempotencyKey = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    };

    if (window.APP_CONFIG.SUPABASE_ANON_KEY) {
      headers['Authorization'] = `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`;
      headers['apikey'] = window.APP_CONFIG.SUPABASE_ANON_KEY;
    }

    abortController = new AbortController();

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: headers,
        signal: abortController.signal,
        body: JSON.stringify({
          messages: conversationHistory,
          context: {
            ultimo_orcamento: localContext.ultimoOrcamento,
          },
        }),
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        throw fetchErr;
      }
      const customErr = new Error('Sem conexão com o servidor.');
      customErr.status = 0;
      customErr.code = 'NETWORK_OFFLINE';
      customErr.details = fetchErr.message;
      throw customErr;
    }

    if (!response.ok) {
      let errJson = null;
      try {
        errJson = await response.json();
      } catch {
        // Not JSON
      }

      const parsedError = errJson?.error || {};
      const customErr = new Error(parsedError.message || `Edge Function retornou status ${response.status}`);
      customErr.status = response.status;
      customErr.code = parsedError.code || (response.status === 400 ? 'VALIDATION_ERROR' : response.status === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR');
      customErr.friendlyMessage = parsedError.message;
      customErr.details = JSON.stringify(errJson || { status: response.status });
      throw customErr;
    }

    const rawData = await response.json();
    const parsed = parseChat(rawData);

    if (!parsed.ok) {
      const customErr = new Error(parsed.error?.message || 'Erro ao processar retorno do assistente.');
      customErr.status = 500;
      customErr.code = parsed.error?.code || 'INTERNAL_ERROR';
      customErr.details = JSON.stringify(parsed.error);
      throw customErr;
    }

    let replyText = parsed.reply || 'Desculpe, não consegui processar sua mensagem.';
    let toolAction = parsed.toolAction || null;

    // Se a ferramenta retornou cálculo de orçamento, armazena no estado local
    if (toolAction && toolAction.type === 'orcamento_calculado') {
      localContext.ultimoOrcamento = toolAction.data;
    }

    // Heurística de proteção no front-end:
    // Só dispara fallback se tool_action !== 'lead_salvo' (M2)
    const phoneMatch = userMsgText.match(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[-\s]?\d{4}\b/);
    const detectouVazamentoNoReply = /quantidade_comodos|Agora vou registrar/i.test(replyText || '');
    if ((!toolAction || toolAction.type !== 'lead_salvo') && (phoneMatch || detectouVazamentoNoReply) && localContext.ultimoOrcamento) {
      const foneFinal = phoneMatch
        ? phoneMatch[0]
        : (replyText && replyText.match(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[-\s]?\d{4}\b/)?.[0]) || '';
      
      const rawNome = userMsgText
        .replace(foneFinal, '')
        .replace(/\b(meu|nome|é|whatsapp|fone|tel|e|sou|o|a)\b/gi, ' ')
        .replace(/[,.:;\-_]/g, ' ')
        .trim();
      const nomeCliente = (rawNome.length >= 2 && !/^(meu|cliente)$/i.test(rawNome)) ? rawNome.split(/\s+/)[0] : 'Cliente';

      const leadPayload = {
        nome: nomeCliente,
        telefone: foneFinal || 'Não informado',
        tipo_servico: localContext.ultimoOrcamento.tipo_servico || 'parede_lisa',
        quantidade_comodos: Number(localContext.ultimoOrcamento.quantidade_comodos) || 1,
        valor_calculado:
          Number(localContext.ultimoOrcamento.valor_total || localContext.ultimoOrcamento.valor_final) || 120.0,
      };

      const leadIdempotencyKey = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      fetch(`${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/salvar-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': leadIdempotencyKey,
          ...(window.APP_CONFIG.SUPABASE_ANON_KEY
            ? {
                Authorization: `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`,
                apikey: window.APP_CONFIG.SUPABASE_ANON_KEY,
              }
            : {}),
        },
        body: JSON.stringify(leadPayload),
      }).catch((e) => console.warn('[frontend] Falha no disparo de contingência do salvar-lead:', e));

      toolAction = {
        type: 'lead_salvo',
        data: leadPayload,
      };
      localContext.ultimoOrcamento = null;
    } else if (toolAction && toolAction.type === 'lead_salvo') {
      localContext.ultimoOrcamento = null;
    }

    // Guarda histórico com texto sanitizado
    conversationHistory.push({ role: 'assistant', content: sanitizeAIText(replyText) });

    // Renderiza a resposta e os cards correspondentes
    appendMessage('assistant', replyText, toolAction);
  }

  /**
   * Modo demonstração offline (Mock de contingência)
   * Garante que os cards visuais e a regra de negócio inviolável possam ser verificados
   * mesmo antes do deploy do Supabase estar concluído.
   */
  async function handleOfflineDemo(text) {
    // Simula atraso humano de digitação
    await new Promise((resolve) => setTimeout(resolve, 800));

    const lower = text.toLowerCase();

    // 1. Caso o usuário informe nome e telefone (salvar lead)
    const phoneMatch = text.match(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[-\s]?\d{4}\b/);
    if (phoneMatch && localContext.ultimoOrcamento) {
      const foneFinal = phoneMatch[0];
      const rawNome = text
        .replace(foneFinal, '')
        .replace(/\b(meu|nome|é|whatsapp|fone|tel|e|sou|o|a)\b/gi, ' ')
        .replace(/[,.:;\-_]/g, ' ')
        .trim();
      const nome = (rawNome.length >= 2 && !/^(meu|cliente)$/i.test(rawNome)) ? rawNome.split(/\s+/)[0] : 'Cliente';

      const leadData = {
        nome: nome,
        telefone: foneFinal,
        tipo_servico: localContext.ultimoOrcamento.tipo_servico,
        quantidade_comodos: localContext.ultimoOrcamento.quantidade_comodos,
        valor_calculado: localContext.ultimoOrcamento.valor_total,
      };

      const reply = `Excelente, ${nome}! Seus dados foram salvos com sucesso e o pintor Valdir já recebeu a notificação com os detalhes do seu orçamento. Ele entrará em contato pelo WhatsApp ${foneFinal} em breve!`;

      conversationHistory.push({ role: 'assistant', content: reply });
      appendMessage('assistant', reply, { type: 'lead_salvo', data: leadData });
      localContext.ultimoOrcamento = null;
      return;
    }

    // 2. Caso o usuário solicite cálculo de orçamento
    let tipoServico = null;
    let precoUnitario = 0;
    let nomeServico = '';

    if (lower.includes('textura')) {
      tipoServico = 'parede_textura';
      precoUnitario = 180.0;
      nomeServico = 'Parede com Textura';
    } else if (lower.includes('teto')) {
      tipoServico = 'teto';
      precoUnitario = 100.0;
      nomeServico = 'Teto';
    } else if (lower.includes('lisa') || lower.includes('parede')) {
      tipoServico = 'parede_lisa';
      precoUnitario = 120.0;
      nomeServico = 'Parede Lisa';
    }

    // Extrai quantidade de cômodos (número)
    const numMatch = text.match(/\b(\d+)\b/);
    const comodos = numMatch ? parseInt(numMatch[1], 10) : 0;

    if (tipoServico && comodos > 0) {
      const total = precoUnitario * comodos;
      const orcamentoData = {
        tipo_servico: tipoServico,
        nome_servico: nomeServico,
        quantidade_comodos: comodos,
        preco_unitario: precoUnitario,
        valor_total: total,
        valor_total_formatado: `R$ ${total.toFixed(2).replace('.', ',')}`,
      };

      localContext.ultimoOrcamento = orcamentoData;

      const reply = `Perfeito! O valor total para pintar ${comodos} cômodo(s) de ${nomeServico} fica em R$ ${total.toFixed(2).replace('.', ',')}.\n\nPara agendarmos ou tirarmos qualquer dúvida, por favor, qual é o seu **Nome** e **WhatsApp**?`;

      conversationHistory.push({ role: 'assistant', content: reply });
      appendMessage('assistant', reply, { type: 'orcamento_calculado', data: orcamentoData });
      return;
    }

    // 3. Caso falte informação de serviço ou cômodo
    let pergunta = 'Para calcular seu orçamento com precisão, por favor me informe:\n';
    if (!tipoServico) {
      pergunta += '• Qual o serviço desejado: **Parede lisa** (R$ 120), **Parede com textura** (R$ 180) ou **Teto** (R$ 100)?\n';
    }
    if (comodos <= 0) {
      pergunta += '• Quantos cômodos receberão a pintura?';
    }

    conversationHistory.push({ role: 'assistant', content: pergunta });
    appendMessage('assistant', pergunta);
  }

  // ==========================================================================
  // 4. SUGESTÕES RÁPIDAS (CHIPS)
  // ==========================================================================
  quickChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-text');
      if (text) {
        userInput.value = text;
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  });

  // ==========================================================================
  // 5. REINICIAR CONVERSA (COM MODAL ACESSÍVEL - M1)
  // ==========================================================================
  btnRestart.addEventListener('click', async () => {
    const confirmou = await confirmModal({
      title: 'Reiniciar Atendimento',
      desc: 'Deseja reiniciar a conversa e fazer um novo orçamento?',
      danger: false,
    });
    if (confirmou) {
      initChat();
      showToast('info', 'Atendimento reiniciado com sucesso.');
    }
  });

  // ==========================================================================
  // 6. MODAL DE CONFIGURAÇÃO (FOCUS-TRAP & ESCAPE - C4)
  // ==========================================================================
  function abrirModalConfig() {
    lastFocusedElement = document.activeElement;
    inputFunctionsUrl.value = window.APP_CONFIG.SUPABASE_FUNCTIONS_URL;
    inputAnonKey.value = window.APP_CONFIG.SUPABASE_ANON_KEY;
    checkDemoMode.checked = window.APP_CONFIG.DEMO_MODE;
    configModal.classList.remove('hidden');
    inputFunctionsUrl.focus();
    document.addEventListener('keydown', handleConfigModalKeydown);
  }

  function fecharModalConfig() {
    configModal.classList.add('hidden');
    document.removeEventListener('keydown', handleConfigModalKeydown);
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
  }

  function handleConfigModalKeydown(e) {
    if (e.key === 'Escape') {
      fecharModalConfig();
    }
  }

  btnConfig.addEventListener('click', abrirModalConfig);
  btnCloseModal.addEventListener('click', fecharModalConfig);
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) fecharModalConfig();
  });

  // Validação customizada da URL em português (M4)
  if (inputFunctionsUrl) {
    inputFunctionsUrl.addEventListener('input', () => {
      inputFunctionsUrl.setCustomValidity('');
    });
    inputFunctionsUrl.addEventListener('invalid', () => {
      inputFunctionsUrl.setCustomValidity('Por favor, informe uma URL válida (ex: https://seu-projeto.supabase.co/functions/v1).');
    });
  }

  // Contador de caracteres dinâmico (M4)
  if (userInput && charCounter) {
    userInput.addEventListener('input', () => {
      const len = userInput.value.length;
      charCounter.textContent = `${len}/140`;
      if (len >= 135) {
        charCounter.className = 'char-counter danger';
      } else if (len >= 110) {
        charCounter.className = 'char-counter warning';
      } else {
        charCounter.className = 'char-counter';
      }
    });
  }

  btnSaveConfig.addEventListener('click', () => {
    const newUrl = inputFunctionsUrl.value.trim();
    const newKey = inputAnonKey.value.trim();
    const demo = checkDemoMode.checked;

    if (newUrl) {
      window.APP_CONFIG.SUPABASE_FUNCTIONS_URL = newUrl;
      localStorage.setItem('orcamento_functions_url', newUrl);
    }
    window.APP_CONFIG.SUPABASE_ANON_KEY = newKey;
    localStorage.setItem('orcamento_anon_key', newKey);

    window.APP_CONFIG.DEMO_MODE = demo;
    localStorage.setItem('orcamento_demo_mode', String(demo));

    fecharModalConfig();
    showToast('success', 'Configurações de conexão salvas!');

    appendMessage(
      'assistant',
      `⚙️ **Configurações salvas!**\n• Conexão: \`${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}\`\n• Modo Demonstração: **${demo ? 'Ativado' : 'Desativado'}**`
    );
  });

  // Iniciar na carga da página
  initChat();
})();
