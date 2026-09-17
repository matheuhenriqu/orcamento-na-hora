// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// EDGE FUNCTION: telegram-webhook
// DESCRIÇÃO: Webhook bidirecional para integração com Telegram Bot API.
//            Registra inscritos na tabela telegram_inscritos, responde comandos
//            e adota contrato previsível {ok, data, meta} (C1 & A6).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { handleCors } from '../_shared/cors.ts';
import { ok, fail, createLogger } from '../_shared/response.ts';

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

/**
 * Comparação em tempo constante para prevenir ataques de temporização
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  // 1. Trata preflight CORS
  const corsPreflight = handleCors(req);
  if (corsPreflight) return corsPreflight;

  const logger = createLogger('telegram-webhook', req);

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const urlObj = new URL(req.url);
  const action = urlObj.searchParams.get('action');

  // ==========================================================================
  // 2. REQUISIÇÕES GET: SETUP E DIAGNÓSTICO DO WEBHOOK (A6: PROTEÇÃO ADMIN)
  // ==========================================================================
  if (req.method === 'GET') {
    const adminSecret = Deno.env.get('ADMIN_DASHBOARD_SECRET') || '';
    const adminKey = req.headers.get('x-admin-key') || '';
    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const providedKey = adminKey || authHeader;

    if (!adminSecret || !constantTimeEqual(providedKey, adminSecret)) {
      return fail('FORBIDDEN', 'Acesso proibido. Autenticação administrativa necessária.', 'Forneça a chave x-admin-key correspondente.', 403, undefined, req);
    }

    if (!botToken) {
      return fail('BOT_TOKEN_MISSING', 'TELEGRAM_BOT_TOKEN não está configurado nas variáveis de ambiente.', 'Configure TELEGRAM_BOT_TOKEN no Supabase.', 500, undefined, req);
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;

    // 2.1 Ação: Configurar Webhook no Telegram
    if (action === 'setup' || action === 'setWebhook') {
      try {
        const tgResp = await fetch(
          `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`
        );
        const tgData = await tgResp.json();
        return ok(
          { result: tgData, action: 'setWebhook', webhookUrl },
          undefined,
          req,
          {
            success: true,
            action: 'setWebhook',
            webhook_url: webhookUrl,
            telegram_response: tgData,
          }
        );
      } catch (err: unknown) {
        return fail('TELEGRAM_SETUP_ERROR', 'Erro ao registrar webhook no Telegram', 'Verifique a conectividade de rede com a API do Telegram.', 500, (err as Error).message, req);
      }
    }

    // 2.2 Ação: Consultar informações do Webhook atual
    if (action === 'getInfo' || action === 'webhookInfo') {
      try {
        const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const tgData = await tgResp.json();
        return ok(
          { result: tgData, action: 'getWebhookInfo' },
          undefined,
          req,
          {
            success: true,
            action: 'getWebhookInfo',
            telegram_response: tgData,
          }
        );
      } catch (err: unknown) {
        return fail('TELEGRAM_INFO_ERROR', 'Erro ao obter dados do webhook', 'Verifique o token do bot.', 500, (err as Error).message, req);
      }
    }

    // 2.3 Status geral e total de inscritos
    const { count, error } = await supabase
      .from('telegram_inscritos')
      .select('*', { count: 'exact', head: true });

    const statusData = {
      status: 'online',
      service: 'telegram-webhook',
      bot_configurado: Boolean(botToken),
      webhook_url: webhookUrl,
      inscritos_ativos: count || 0,
      tabela_status: error ? `Aviso tabela: ${error.message}` : 'Tabela telegram_inscritos operacional',
    };

    return ok({ result: statusData }, undefined, req, statusData);
  }

  // ==========================================================================
  // 3. REQUISIÇÕES POST: RECEBIMENTO DE MENSAGENS E ATUALIZAÇÕES DO TELEGRAM
  // ==========================================================================
  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 'Método não permitido. Utilize POST para o webhook ou GET para diagnóstico.', 'Envie requisições POST para receber mensagens do Telegram.', 405, undefined, req);
  }

  // A6: Exigir TELEGRAM_WEBHOOK_SECRET sempre (retorna 500 se ausente)
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!webhookSecret) {
    logger.error('TELEGRAM_WEBHOOK_SECRET não configurado.');
    return fail('WEBHOOK_SECRET_MISSING', 'Configuração de segurança do webhook incompleta no servidor.', 'Configure a variável TELEGRAM_WEBHOOK_SECRET.', 500, undefined, req);
  }

  const receivedSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!constantTimeEqual(receivedSecret, webhookSecret)) {
    logger.warn('Tentativa de acesso com secret token inválido ou ausente');
    return fail('UNAUTHORIZED', 'Acesso não autorizado ao webhook.', 'Forneça o header x-telegram-bot-api-secret-token válido.', 401, undefined, req);
  }

  try {
    const update = await req.json().catch(() => ({}));
    const message = update.message || update.edited_message;

    // Se a mensagem for nula ou não pertencer a um chat, confirmar recebimento com HTTP 200
    if (!message || !message.chat) {
      return ok({ result: 'ignored', ok: true }, undefined, req, { ok: true, ignored: true });
    }

    // A6: Validar chat.id como inteiro numérico
    const rawChatId = message.chat.id;
    const chatId = Number(rawChatId);
    if (!Number.isInteger(chatId) || chatId === 0) {
      return ok({ result: 'invalid_chat_id', ok: true }, undefined, req, { ok: true, ignored: true });
    }

    const username = message.from?.username || message.chat.username || '';
    const firstName = message.from?.first_name || message.chat.first_name || 'Profissional';
    let text = String(message.text || '').trim();
    if (text.length > 4096) {
      text = text.slice(0, 4096);
    }

    // Verificação de autorização do chat
    const authorizedChatId = Deno.env.get('TELEGRAM_CHAT_ID');
    const adminChatsStr = Deno.env.get('TELEGRAM_ADMIN_CHATS') || '';
    const adminChats = adminChatsStr.split(',').map((s) => s.trim()).filter(Boolean);
    const isAuthorizedChat =
      (authorizedChatId && String(chatId) === String(authorizedChatId)) ||
      adminChats.includes(String(chatId));

    logger.info(`Mensagem recebida de chat ${chatId}: comando ou texto recebido`);

    // 3.1 Comando: /start (Inscrição segura do prestador)
    if (text.startsWith('/start')) {
      if (isAuthorizedChat || !authorizedChatId) {
        const { error: upsertErr } = await supabase.from('telegram_inscritos').upsert({
          chat_id: chatId,
          username: username || null,
          first_name: firstName,
          created_at: new Date().toISOString(),
        });

        if (upsertErr) {
          logger.error('Erro ao registrar inscrito no Supabase:', upsertErr.message);
          await responderTelegram(
            botToken,
            chatId,
            `⚠️ Olá, <b>${firstName}</b>. Houve uma falha ao salvar sua inscrição no banco de dados. Tente novamente.`
          );
        } else {
          logger.info(`Chat inscrito com sucesso! ID: ${chatId}`);
          const msgBoasVindas = `👋 <b>Olá, ${firstName}!</b>\n\n` +
            `✅ <b>Notificações do Orçamento na Hora ativadas com sucesso!</b>\n\n` +
            `Você agora receberá alertas instantâneos sempre que um novo cliente finalizar um orçamento no site.\n\n` +
            `📌 <b>Comandos disponíveis:</b>\n` +
            `• <b>/orcamentos</b> - Ver os últimos 5 orçamentos recebidos\n` +
            `• <b>/status</b> - Resumo do faturamento e leads capturados\n` +
            `• <b>/ajuda</b> - Informações do sistema\n` +
            `• <b>/sair</b> - Desativar notificações neste chat`;

          await responderTelegram(botToken, chatId, msgBoasVindas);
        }
      } else {
        const msgNaoAutorizado = `🔒 <b>Acesso Restrito</b>\n\n` +
          `Olá, <b>${firstName}</b>. Este bot é exclusivo para notificações operacionais do pintor Valdir.\n` +
          `Seu chat ID (<code>${chatId}</code>) não está na lista de administradores autorizados.`;
        await responderTelegram(botToken, chatId, msgNaoAutorizado);
      }
      return ok({ result: { command: 'start', chatId } }, undefined, req, { ok: true, command: 'start' });
    }

    // 3.2 Comando: /orcamentos
    if (text.startsWith('/orcamentos') || text.startsWith('/leads')) {
      const { data: leads, error: leadsErr } = await supabase
        .from('orcamentos_leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (leadsErr) {
        await responderTelegram(botToken, chatId, '⚠️ Não foi possível consultar os orçamentos no momento.');
        return ok({ result: { command: 'orcamentos', error: leadsErr.message } }, undefined, req, { ok: true });
      }

      if (!leads || leads.length === 0) {
        await responderTelegram(botToken, chatId, '📭 Nenhum orçamento registrado até o momento.');
        return ok({ result: { command: 'orcamentos', total: 0 } }, undefined, req, { ok: true });
      }

      let msgLista = `📋 <b>ÚLTIMOS ${leads.length} ORÇAMENTOS RECEBIDOS:</b>\n\n`;
      leads.forEach((l: any, idx: number) => {
        const dataStr = new Date(l.created_at).toLocaleDateString('pt-BR');
        const valorFmt = Number(l.valor_calculado).toFixed(2).replace('.', ',');
        const telLimpo = String(l.telefone).replace(/\D/g, '');
        msgLista += `<b>${idx + 1}. ${l.nome}</b> (${dataStr})\n` +
          `   🛠 Serviço: ${l.tipo_servico} (${l.quantidade_comodos} cômodos)\n` +
          `   💰 Valor: R$ ${valorFmt}\n` +
          `   📱 <a href="https://wa.me/55${telLimpo}">Chamar WhatsApp</a>\n\n`;
      });

      await responderTelegram(botToken, chatId, msgLista);
      return ok({ result: { command: 'orcamentos', total: leads.length } }, undefined, req, { ok: true });
    }

    // 3.3 Comando: /status
    if (text.startsWith('/status')) {
      const { data: leads } = await supabase.from('orcamentos_leads').select('valor_calculado');
      const total = (leads || []).length;
      const faturamento = (leads || []).reduce((acc: number, cur: any) => acc + (Number(cur.valor_calculado) || 0), 0);
      const media = total > 0 ? faturamento / total : 0;

      const faturamentoFmt = faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const mediaFmt = media.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      const msgStatus = `📊 <b>PAINEL DE PERFORMANCE DO PINTOR:</b>\n\n` +
        `👥 <b>Total de Leads Capturados:</b> ${total}\n` +
        `💵 <b>Faturamento Potencial:</b> ${faturamentoFmt}\n` +
        `📈 <b>Ticket Médio:</b> ${mediaFmt}\n\n` +
        `🟢 <b>Sistema:</b> Supabase PostgreSQL + Edge Functions operacional!`;

      await responderTelegram(botToken, chatId, msgStatus);
      return ok({ result: { command: 'status', total, faturamento } }, undefined, req, { ok: true, command: 'status' });
    }

    // 3.4 Comando: /sair
    if (text.startsWith('/sair') || text.startsWith('/stop')) {
      await supabase.from('telegram_inscritos').delete().eq('chat_id', chatId);
      const msgSair = `🔕 <b>Notificações Desativadas!</b>\n\n` +
        `Você não receberá mais alertas automáticos neste chat.\n` +
        `Para reativar a qualquer momento, envie o comando <b>/start</b>.`;

      await responderTelegram(botToken, chatId, msgSair);
      return ok({ result: { command: 'sair' } }, undefined, req, { ok: true, command: 'sair' });
    }

    // 3.5 Comando: /ajuda
    const msgAjuda = `💡 <b>Central de Ajuda do Bot Valdir Pintor:</b>\n\n` +
      `Envie um dos seguintes comandos:\n` +
      `• <b>/start</b> - Inscrever este chat para receber alertas\n` +
      `• <b>/orcamentos</b> - Ver os 5 orçamentos mais recentes\n` +
      `• <b>/status</b> - Ver resumo de leads e faturamento\n` +
      `• <b>/sair</b> - Cancelar notificações`;

    await responderTelegram(botToken, chatId, msgAjuda);
    return ok({ result: { command: 'ajuda' } }, undefined, req, { ok: true, command: 'ajuda' });
  } catch (err: unknown) {
    logger.error('Erro ao processar webhook:', err);
    return fail('WEBHOOK_PROCESSING_ERROR', 'Falha ao processar atualização do Telegram.', 'Tente novamente.', 500, (err as Error).message, req);
  }
});
