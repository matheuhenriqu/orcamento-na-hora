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
      `Olá! Seja muito bem-vindo ao **O Orçamento na Hora** do pintor **Valdir**! 🎨\n\n` +
      `Trabalho com preços fixos oficiais por cômodo:\n` +
      `• **Parede lisa:** R$ 120,00 por cômodo\n` +
      `• **Parede com textura:** R$ 180,00 por cômodo\n` +
      `• **Teto:** R$ 100,00 por cômodo\n\n` +
      `Qual serviço você gostaria de realizar e em quantos cômodos?`;

    appendMessage('assistant', mensagemInicial);
  }

  // ==========================================================================
  // 2. RENDERIZAÇÃO DE MENSAGENS E CARDS
  // ==========================================================================
  function appendMessage(role, text, toolAction = null) {
    const isUser = role === 'user';
    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user-row' : 'bot-row'}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar-small';
    avatar.textContent = isUser ? '👤' : '👨‍🎨';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = formatMarkdown(text);

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
   * Converte marcações simples de Markdown (negrito, itálico, listas, quebras)
   */
  function formatMarkdown(str) {
    if (!str) return '';
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/•\s*(.*)/g, '• $1')
      .replace(/\n/g, '<br>');
  }

  /**
   * Cria o CARD VERDE DE ORÇAMENTO (quando calcular_orcamento é executada)
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

    const valorTotal = Number(data.valor_total || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const subtotalFormatado = Number(data.subtotal || data.valor_total || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const descontoLinha = data.desconto_aplicado > 0
      ? `<div class="orcamento-item" style="grid-column: span 2; background: rgba(16, 185, 129, 0.15); padding: 6px 10px; border-radius: 6px; border: 1px dashed #10b981;">
          <span style="font-size: 0.8rem; color: #6ee7b7; font-weight: 600;">🎉 Desconto por Quantidade (10%):</span>
          <span style="font-size: 0.9rem; color: #34d399; font-weight: 700; float: right;">- ${Number(data.desconto_aplicado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
         </div>`
      : '';

    const taxaVisitaLinha = data.taxa_visita
      ? `<div class="orcamento-item" style="grid-column: span 2; background: rgba(56, 189, 248, 0.1); padding: 6px 10px; border-radius: 6px; border: 1px dashed #38bdf8;">
          <span style="font-size: 0.8rem; color: #bae6fd; font-weight: 600;">🚗 Taxa de Visita/Deslocamento:</span>
          <span style="font-size: 0.9rem; color: #38bdf8; font-weight: 700; float: right;">+ R$ 30,00</span>
         </div>`
      : '';

    card.innerHTML = `
      <div class="orcamento-header">
        <span class="orcamento-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Orçamento Oficial Calculado
        </span>
        <span style="font-size: 0.76rem; color: #a7f3d0;">Tabela Valdir Pintor</span>
      </div>

      <div class="orcamento-grid">
        <div class="orcamento-item">
          <span class="orcamento-label">Serviço Solicitado</span>
          <span class="orcamento-val-text">${nomeServico}</span>
        </div>
        <div class="orcamento-item">
          <span class="orcamento-label">Quantidade de Cômodos</span>
          <span class="orcamento-val-text">${data.quantidade_comodos} cômodo(s)</span>
        </div>
        <div class="orcamento-item">
          <span class="orcamento-label">Preço Unitário</span>
          <span class="orcamento-val-text">${valorUnitario} / cômodo</span>
        </div>
        <div class="orcamento-item">
          <span class="orcamento-label">Subtotal</span>
          <span class="orcamento-val-text">${subtotalFormatado}</span>
        </div>
        ${descontoLinha}
        ${taxaVisitaLinha}
      </div>

      <div class="orcamento-total-box">
        <div>
          <span class="total-title">VALOR FINAL ESTIMADO</span>
          <p style="font-size: 0.74rem; color: #94a3b8; margin-top: 2px;">Sem taxas ocultas</p>
        </div>
        <div class="total-number">${valorTotal}</div>
      </div>

      <div class="orcamento-cta-prompt">
        <span>👉</span> <strong>Informe seu Nome e WhatsApp</strong> para o Valdir confirmar o agendamento!
      </div>
    `;

    return card;
  }

  /**
   * Cria o CARD AZUL DE CONFIRMAÇÃO DO LEAD (quando salvar_lead é executada)
   */
  function createLeadCard(data) {
    const card = document.createElement('div');
    card.className = 'lead-card';

    // Sincronizar lead com cache local para o painel administrativo
    try {
      const savedLeads = JSON.parse(localStorage.getItem('orcamento_local_leads') || '[]');
      const novoLead = {
        id: data.lead_id || crypto.randomUUID(),
        nome: data.nome || 'Cliente',
        telefone: data.telefone || '',
        tipo_servico: data.tipo_servico || 'parede_lisa',
        quantidade_comodos: Number(data.quantidade_comodos || 1),
        valor_calculado: Number(data.valor_calculado || 0),
        created_at: new Date().toISOString(),
      };
      savedLeads.unshift(novoLead);
      localStorage.setItem('orcamento_local_leads', JSON.stringify(savedLeads));
    } catch (e) {
      console.warn('Erro ao cachear lead localmente:', e);
    }

    const valorFormatado = Number(data.valor_calculado || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    const nomeServico = data.tipo_servico === 'parede_textura' ? 'Parede com Textura' :
      data.tipo_servico === 'teto' ? 'Teto' : 'Parede Lisa';

    card.innerHTML = `
      <div class="lead-header">
        <span class="lead-tag">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Contato Registrado com Sucesso!
        </span>
        <span style="font-size: 0.76rem; color: #7dd3fc;">Orçamento Salvo</span>
      </div>

      <div class="lead-grid">
        <div class="orcamento-item">
          <span class="orcamento-label">Cliente</span>
          <span class="orcamento-val-text">${data.nome || 'Cliente'}</span>
        </div>
        <div class="orcamento-item">
          <span class="orcamento-label">WhatsApp / Contato</span>
          <span class="orcamento-val-text">${data.telefone || ''}</span>
        </div>
        <div class="orcamento-item">
          <span class="orcamento-label">Serviço</span>
          <span class="orcamento-val-text">${nomeServico} (${data.quantidade_comodos} cômodos)</span>
        </div>
        <div class="orcamento-item">
          <span class="orcamento-label">Total Orçado</span>
          <span class="orcamento-val-text" style="color: #38bdf8;">${valorFormatado}</span>
        </div>
      </div>

      <div class="lead-status-box">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2L2 9.5l7 3 3 7z"></path>
        </svg>
        <div>
          <strong>Notificação enviada ao pintor via Telegram!</strong>
          <p style="margin-top: 2px; font-size: 0.78rem; opacity: 0.9;">O Valdir recebeu seus dados e entrará em contato em breve para confirmar os detalhes.</p>
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
      btnSend.disabled = true;
      scrollToBottom();
    } else {
      typingIndicator.classList.add('hidden');
      btnSend.disabled = false;
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
        await sendToSupabaseEdgeFunction();
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
  async function sendToSupabaseEdgeFunction() {
    const url = `${window.APP_CONFIG.SUPABASE_FUNCTIONS_URL}/chat`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (window.APP_CONFIG.SUPABASE_ANON_KEY) {
      headers['Authorization'] = `Bearer ${window.APP_CONFIG.SUPABASE_ANON_KEY}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        messages: conversationHistory,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`Edge Function retornou status ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const replyText = data.reply || 'Desculpe, não consegui processar sua mensagem.';
    const toolAction = data.tool_action || null;

    // Guarda histórico
    conversationHistory.push({ role: 'assistant', content: replyText });

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
      const telefone = phoneMatch[0];
      const nomeMatch = text.replace(phoneMatch[0], '').replace(/(meu|nome|é|whatsapp|fone|e|sou|o)/gi, '').trim();
      const nome = nomeMatch.length > 1 ? nomeMatch : 'Cliente';

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
