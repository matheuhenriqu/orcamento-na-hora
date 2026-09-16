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

  // Histórico de Mensagens no formato OpenAI/Groq
  let conversationHistory = [];

  // Estado da conversa para modo de contingência/demo
  const localContext = {
    ultimoOrcamento: null,
  };

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

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    const agora = new Date();
    timeSpan.textContent = agora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    contentDiv.appendChild(timeSpan);

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

  function setTyping(isTyping) {
    if (isTyping) {
      typingIndicator.classList.remove('hidden');
      userInput.disabled = true;
      userInput.setAttribute('data-prev-placeholder', userInput.placeholder);
      userInput.placeholder = "Valdir está digitando...";
      btnSend.disabled = true;
      btnSend.classList.add('loading');
      scrollToBottom();
    } else {
      typingIndicator.classList.add('hidden');
      userInput.disabled = false;
      userInput.placeholder = userInput.getAttribute('data-prev-placeholder') || "Digite o serviço e a quantidade de cômodos...";
      btnSend.disabled = false;
      btnSend.classList.remove('loading');
      userInput.focus();
    }
  }

  // ==========================================================================
  // 3. ENVIO DE MENSAGENS E COMUNICAÇÃO COM O BACKEND
  // ==========================================================================
  chatForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;

    // Adiciona a mensagem do usuário na tela e no histórico
    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });
    userInput.value = '';

    setTyping(true);

    try {
      if (window.APP_CONFIG.DEMO_MODE) {
        // Simulação inteligente de contingência caso esteja em modo Demo
        await handleOfflineDemo(text);
      } else {
        await sendToSupabaseEdgeFunction(text);
      }
    } catch (err) {
      console.error('Erro na chamada da Edge Function:', err);
      // Caso a requisição ao backend falhe por falta de configuração ou rede,
      // fallback gracioso explicando a situação e oferecendo ajuda
      appendMessage(
        'assistant',
        `⚠️ **Nota de Conexão:** Não foi possível conectar ao endpoint das Edge Functions em \`${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}\`.\n\n` +
        `Para configurar sua URL do Supabase ou testar em modo demonstração offline, clique no botão de engrenagem ⚙️ no canto superior direito!`
      );
    } finally {
      setTyping(false);
    }
  });

  /**
   * Envia o histórico de mensagens para a Edge Function /chat
   */
  async function sendToSupabaseEdgeFunction(userMsgText = '') {
    const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/chat`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (window.APP_CONFIG.SUPABASE_ANON_KEY) {
      headers['Authorization'] = `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`;
      headers['apikey'] = window.APP_CONFIG.SUPABASE_ANON_KEY;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        messages: conversationHistory,
        context: {
          ultimo_orcamento: localContext.ultimoOrcamento,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Edge Function retornou status ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    let replyText = data.reply || 'Desculpe, não consegui processar sua mensagem.';
    let toolAction = data.tool_action || null;

    // Se a ferramenta retornou cálculo de orçamento, armazena no estado local
    if (toolAction && toolAction.type === 'orcamento_calculado') {
      localContext.ultimoOrcamento = toolAction.data;
    }

    // Heurística de proteção no front-end:
    // Se a IA não retornou tool_action de lead_salvo, mas o usuário enviou contato (WhatsApp)
    // e havia um orçamento recente, dispara persistência do lead e renderiza o card azul
    const phoneMatch = userMsgText.match(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[-\s]?\d{4}\b/);
    const detectouVazamentoNoReply = /quantidade_comodos|Agora vou registrar/i.test(data.reply || '');
    if ((!toolAction || toolAction.type !== 'lead_salvo') && (phoneMatch || detectouVazamentoNoReply) && localContext.ultimoOrcamento) {
      console.log('[frontend] Disparando persistência do lead e Webhook Telegram em contingência...');
      const foneFinal = phoneMatch
        ? phoneMatch[0]
        : (data.reply && data.reply.match(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[-\s]?\d{4}\b/)?.[0]) || '';
      const rawNome = userMsgText
        .replace(foneFinal, '')
        .replace(/\b(meu|nome|é|whatsapp|fone|tel|e|sou|o|a)\b/gi, ' ')
        .replace(/[,.:;\-_]/g, ' ')
        .trim();
      const nomeCliente = rawNome.length >= 2 ? rawNome.split(/\s+/)[0] : 'Cliente';

      const leadPayload = {
        nome: nomeCliente,
        telefone: phoneMatch[0],
        tipo_servico: localContext.ultimoOrcamento.tipo_servico || 'parede_lisa',
        quantidade_comodos: Number(localContext.ultimoOrcamento.quantidade_comodos) || 1,
        valor_calculado:
          Number(localContext.ultimoOrcamento.valor_total || localContext.ultimoOrcamento.valor_final) || 120.0,
      };

      // Disparo assíncrono para o endpoint salvar-lead (garantindo inserção no Supabase e Webhook Telegram)
      fetch(`${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/salvar-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

    // Renderiza a resposta e os cards correspondentes (incluindo o card azul)
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
      const rawNome = text
        .replace(phoneMatch[0], '')
        .replace(/\b(meu|nome|é|whatsapp|fone|tel|e|sou|o|a)\b/gi, ' ')
        .replace(/[,.:;\-_]/g, ' ')
        .trim();
      const nome = rawNome.length >= 2 ? rawNome.split(/\s+/)[0] : 'Cliente';

      const leadData = {
        nome: nome,
        telefone: telefone,
        tipo_servico: localContext.ultimoOrcamento.tipo_servico,
        quantidade_comodos: localContext.ultimoOrcamento.quantidade_comodos,
        valor_calculado: localContext.ultimoOrcamento.valor_total,
      };

      const reply = `Excelente, ${nome}! Seus dados foram salvos com sucesso e o pintor Valdir já recebeu a notificação com os detalhes do seu orçamento. Ele entrará em contato pelo WhatsApp ${telefone} em breve!`;

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
  // 5. REINICIAR CONVERSA
  // ==========================================================================
  btnRestart.addEventListener('click', () => {
    if (confirm('Deseja reiniciar a conversa e fazer um novo orçamento?')) {
      initChat();
    }
  });

  // ==========================================================================
  // 6. MODAL DE CONFIGURAÇÃO
  // ==========================================================================
  btnConfig.addEventListener('click', () => {
    inputFunctionsUrl.value = window.APP_CONFIG.SUPABASE_FUNCTIONS_URL;
    inputAnonKey.value = window.APP_CONFIG.SUPABASE_ANON_KEY;
    checkDemoMode.checked = window.APP_CONFIG.DEMO_MODE;
    configModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    configModal.classList.add('hidden');
  });

  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) {
      configModal.classList.add('hidden');
    }
  });

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

    configModal.classList.add('hidden');

    appendMessage(
      'assistant',
      `⚙️ **Configurações salvas!**\n• Endpoint: \`${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}\`\n• Modo Demonstração: **${demo ? 'Ativado' : 'Desativado'}**`
    );
  });

  // Iniciar na carga da página
  initChat();
})();
