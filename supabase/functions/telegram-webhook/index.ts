// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// EDGE FUNCTION: telegram-webhook
// DESCRIÇÃO: Webhook bidirecional para integração com Telegram Bot API.
//            Registra inscritos na tabela telegram_inscritos e responde comandos.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/**
 * Envia mensagem formatada em HTML de volta ao chat do Telegram.
 */
async function responderTelegram(botToken: string, chatId: number | string, textHtml: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: textHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      console.error('[telegram-webhook] Erro ao responder via Telegram:', data);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram-webhook] Falha de conexão com api.telegram.org:', err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  // 1. Trata preflight CORS
  const corsPreflight = handleCors(req);
  if (corsPreflight) return corsPreflight;

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const urlObj = new URL(req.url);
  const action = urlObj.searchParams.get('action');

  // ==========================================================================
  // 2. REQUISIÇÕES GET: SETUP E DIAGNÓSTICO DO WEBHOOK
  // ==========================================================================
  if (req.method === 'GET') {
    if (!botToken) {
      return errorResponse('TELEGRAM_BOT_TOKEN não está configurado nas variáveis de ambiente.', 500);
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;

    // 2.1 Ação: Configurar Webhook no Telegram
    if (action === 'setup' || action === 'setWebhook') {
      try {
        const tgResp = await fetch(
          `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`
        );
        const tgData = await tgResp.json();
        return jsonResponse({
          success: true,
          action: 'setWebhook',
          webhook_url: webhookUrl,
          telegram_response: tgData,
        });
      } catch (err: unknown) {
        return errorResponse('Erro ao registrar webhook no Telegram', 500, (err as Error).message);
      }
    }

    // 2.2 Ação: Consultar informações do Webhook atual
    if (action === 'getInfo' || action === 'webhookInfo') {
      try {
        const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const tgData = await tgResp.json();
        return jsonResponse({
          success: true,
          action: 'getWebhookInfo',
          telegram_response: tgData,
        });
      } catch (err: unknown) {
        return errorResponse('Erro ao obter dados do webhook', 500, (err as Error).message);
      }
    }

    // 2.3 Status geral e total de inscritos
    const { count, error } = await supabase
      .from('telegram_inscritos')
      .select('*', { count: 'exact', head: true });

    return jsonResponse({
      status: 'online',
      service: 'telegram-webhook',
      bot_configurado: Boolean(botToken),
      webhook_url: webhookUrl,
      inscritos_ativos: count || 0,
      tabela_status: error ? `Aviso tabela: ${error.message}` : 'Tabela telegram_inscritos operacional',
    });
  }

  // ==========================================================================
  // 3. REQUISIÇÕES POST: RECEBIMENTO DE MENSAGENS E ATUALIZAÇÕES DO TELEGRAM
  // ==========================================================================
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido. Utilize POST para o webhook ou GET para diagnóstico.', 405);
  }

  // Validação opcional de segurança recomendada pelo Telegram: Secret Token
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (webhookSecret) {
    const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token');
    if (receivedSecret !== webhookSecret) {
      console.warn('[telegram-webhook] Tentativa de acesso com secret token inválido ou ausente');
      return errorResponse('Acesso não autorizado ao webhook', 401);
    }
  }

  try {
    const update = await req.json().catch(() => ({}));
    const message = update.message || update.edited_message;

    // Se a mensagem for nula ou não pertencer a um chat, confirmar recebimento com HTTP 200
    if (!message || !message.chat) {
      return jsonResponse({ ok: true, ignored: true });
    }

    const chatId = message.chat.id;
    const username = message.from?.username || message.chat.username || '';
    const firstName = message.from?.first_name || message.chat.first_name || 'Profissional';
    const text = (message.text || '').trim();

    // Verificação de autorização do chat
    const authorizedChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    const adminChatsStr = Deno.env.get('TELEGRAM_ADMIN_CHATS') || '';
    const adminChats = adminChatsStr.split(',').map((s) => s.trim()).filter(Boolean);
    const isAuthorizedChat =
      (authorizedChatId && String(chatId) === String(authorizedChatId)) ||
      adminChats.includes(String(chatId));

    console.log(`[telegram-webhook] Mensagem recebida de @${username || chatId}: "${text}" (Autorizado: ${isAuthorizedChat})`);

    // 3.1 Comando: /start (Inscrição segura do prestador)
    if (text.startsWith('/start')) {
      if (isAuthorizedChat || !authorizedChatId) {
        const { error: dbError } = await supabase
          .from('telegram_inscritos')
          .upsert({
            chat_id: chatId,
            username: username || null,
            first_name: firstName,
            created_at: new Date().toISOString(),
          }, { onConflict: 'chat_id' });

        if (dbError) {
          console.error('[telegram-webhook] Erro ao salvar inscrito:', dbError);
        }

        const resposta = `🎨 <b>Olá, ${firstName}! Conexão com o Bot Oficial Estabelecida!</b>

Você acaba de se inscrever no sistema oficial de <b>Valdir Pintura & Acabamentos</b>.

✅ <b>Status:</b> Notificações em tempo real <b>ATIVADAS</b> neste chat.
Sempre que um cliente solicitar um orçamento ou registrar contato no site, você receberá um alerta imediato aqui!

📋 <b>Comandos disponíveis:</b>
• <b>/orcamentos</b> - Exibe os últimos 5 orçamentos registrados
• <b>/status</b> - Resumo das métricas de atendimento e faturamento
• <b>/ajuda</b> - Informações do sistema
• <b>/sair</b> - Pausar o recebimento de alertas neste dispositivo

<i>Aguardando novos orçamentos no site... Boas vendas! 🚀</i>`;

        await responderTelegram(botToken, chatId, resposta);
        return jsonResponse({ ok: true, command: 'start', chat_id: chatId, authorized: true });
      } else {
        const msgAcessoNegado = `🎨 <b>Olá, ${firstName}! Bem-vindo ao canal oficial de Valdir Pintura & Acabamentos.</b>

Este bot é exclusivo para notificações e relatórios operacionais do prestador.
Para simular ou solicitar um orçamento oficial gratuito em instantes, utilize nosso terminal web:
🌐 <b>https://orcamento-na-hora.pages.dev</b>`;

        await responderTelegram(botToken, chatId, msgAcessoNegado);
        return jsonResponse({ ok: true, command: 'start', chat_id: chatId, authorized: false });
      }
    }

    // 3.2 Comando: /orcamentos (Ver últimos leads - RESTRITO A ADMINISTRADORES)
    if (text.startsWith('/orcamentos') || text.startsWith('/leads')) {
      if (!isAuthorizedChat && authorizedChatId) {
        await responderTelegram(
          botToken,
          chatId,
          '🔒 <b>Acesso Restrito:</b> Os orçamentos e dados de contato de clientes são confidenciais e restritos ao prestador de serviços autorizado.'
        );
        return jsonResponse({ ok: true, command: 'orcamentos', authorized: false });
      }

      const { data: leads, error } = await supabase
        .from('orcamentos_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error || !leads || leads.length === 0) {
        await responderTelegram(
          botToken,
          chatId,
          '📋 <b>Nenhum orçamento encontrado</b>\nAinda não há leads registrados no sistema.'
        );
        return jsonResponse({ ok: true, command: 'orcamentos', total: 0 });
      }

      let listaHtml = `📋 <b>ÚLTIMOS ${leads.length} ORÇAMENTOS REGISTRADOS:</b>\n\n`;

      leads.forEach((l, idx) => {
        const servicoNome =
          l.tipo_servico === 'parede_textura'
            ? 'Textura'
            : l.tipo_servico === 'teto'
            ? 'Teto'
            : 'Parede Lisa';

        const valor = Number(l.valor_calculado || 0).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });

        const foneLimpo = (l.telefone || '').replace(/\D/g, '');
        const foneComPais = foneLimpo.startsWith('55') ? foneLimpo : `55${foneLimpo}`;
        const waLink = `https://wa.me/${foneComPais}`;

        listaHtml += `<b>${idx + 1}. ${l.nome}</b>\n`;
        listaHtml += `🛠️ Serviço: ${servicoNome} (${l.quantidade_comodos} cômodos)\n`;
        listaHtml += `💰 Valor: <b>${valor}</b>\n`;
        listaHtml += `📱 WhatsApp: <a href="${waLink}">${l.telefone}</a>\n\n`;
      });

      listaHtml += `<i>Acesse o painel web para gerenciar todos os leads.</i>`;
      await responderTelegram(botToken, chatId, listaHtml);
      return jsonResponse({ ok: true, command: 'orcamentos', total: leads.length });
    }

    // 3.3 Comando: /status (Métricas Rápidas - RESTRITO A ADMINISTRADORES)
    if (text.startsWith('/status') || text.startsWith('/metricas')) {
      if (!isAuthorizedChat && authorizedChatId) {
        await responderTelegram(
          botToken,
          chatId,
          '🔒 <b>Acesso Restrito:</b> O faturamento e métricas de desempenho são confidenciais.'
        );
        return jsonResponse({ ok: true, command: 'status', authorized: false });
      }

      const { data: leads } = await supabase.from('orcamentos_leads').select('valor_calculado');
      const total = (leads || []).length;
      const faturamento = (leads || []).reduce((acc, cur) => acc + (Number(cur.valor_calculado) || 0), 0);
      const media = total > 0 ? faturamento / total : 0;

      const faturamentoFmt = faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const mediaFmt = media.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      const msgStatus = `📊 <b>PAINEL DE PERFORMANCE DO PINTOR:</b>

👥 <b>Total de Leads Capturados:</b> ${total}
💵 <b>Faturamento Potencial:</b> ${faturamentoFmt}
📈 <b>Ticket Médio:</b> ${mediaFmt}

🟢 <b>Sistema:</b> Supabase PostgreSQL + Edge Functions operacional!`;

      await responderTelegram(botToken, chatId, msgStatus);
      return jsonResponse({ ok: true, command: 'status' });
    }

    // 3.4 Comando: /sair (Desinscrição)
    if (text.startsWith('/sair') || text.startsWith('/stop')) {
      await supabase.from('telegram_inscritos').delete().eq('chat_id', chatId);
      const msgSair = `🔕 <b>Notificações Desativadas!</b>

Você não receberá mais alertas automáticos neste chat.
Para reativar a qualquer momento, basta enviar o comando <b>/start</b>.`;

      await responderTelegram(botToken, chatId, msgSair);
      return jsonResponse({ ok: true, command: 'sair' });
    }

    // 3.5 Comando: /ajuda
    const msgAjuda = `💡 <b>Central de Ajuda do Bot Valdir Pintor:</b>

Envie um dos seguintes comandos:
• <b>/start</b> - Inscrever este chat para receber alertas
• <b>/orcamentos</b> - Ver os 5 orçamentos mais recentes
• <b>/status</b> - Ver resumo de leads e faturamento
• <b>/sair</b> - Cancelar notificações`;

    await responderTelegram(botToken, chatId, msgAjuda);
    return jsonResponse({ ok: true, command: 'ajuda' });
  } catch (err: unknown) {
    console.error('[telegram-webhook] Erro ao processar webhook:', err);
    return jsonResponse({ ok: false, error: (err as Error).message });
  }
});
