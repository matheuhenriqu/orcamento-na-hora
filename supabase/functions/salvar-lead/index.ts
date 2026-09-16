// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// EDGE FUNCTION: salvar-lead
// DESCRIÇÃO: Persiste os dados do lead na tabela orcamentos_leads e dispara
//            notificação em tempo real via Telegram Bot API.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface SalvarLeadPayload {
  nome: string;
  telefone: string;
  tipo_servico: string;
  quantidade_comodos: number;
  valor_calculado: number;
}

/**
 * Envia notificação assíncrona a todos os inscritos no Telegram.
 * Trata erros internamente para nunca interromper a gravação do lead no banco.
 */
async function enviarNotificacaoTelegram(
  lead: {
    nome: string;
    telefone: string;
    tipo_servico: string;
    quantidade_comodos: number;
    valor_calculado: number;
  },
  supabaseClient?: any
): Promise<{ enviado: boolean; motivo?: string; total_destinatarios?: number }> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    const msg = 'TELEGRAM_BOT_TOKEN não configurado nas variáveis de ambiente. Notificação ignorada.';
    console.warn(`[salvar-lead] ${msg}`);
    return { enviado: false, motivo: msg };
  }

  // Obter destinatários: inscritos na tabela + fallback de variável de ambiente
  const destinatarios = new Set<string | number>();
  const envChatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (envChatId) destinatarios.add(envChatId);

  if (supabaseClient) {
    try {
      const { data: inscritos, error } = await supabaseClient
        .from('telegram_inscritos')
        .select('chat_id');

      if (!error && inscritos) {
        inscritos.forEach((item: { chat_id: number | string }) => {
          if (item.chat_id) destinatarios.add(item.chat_id);
        });
      }
    } catch (e) {
      console.warn('[salvar-lead] Não foi possível consultar telegram_inscritos:', e);
    }
  }

  if (destinatarios.size === 0) {
    const msg = 'Nenhum chat_id inscrito na tabela telegram_inscritos nem em TELEGRAM_CHAT_ID. Envie /start no bot para se inscrever.';
    console.warn(`[salvar-lead] ${msg}`);
    return { enviado: false, motivo: msg };
  }

  const nomeServicoAmigavel =
    lead.tipo_servico === 'parede_lisa'
      ? 'Parede Lisa'
      : lead.tipo_servico === 'parede_textura'
      ? 'Parede com Textura'
      : lead.tipo_servico === 'teto'
      ? 'Teto'
      : lead.tipo_servico;

  const valorFormatado = Number(lead.valor_calculado).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const agora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });

  const foneLimpo = (lead.telefone || '').replace(/\D/g, '');
  const foneComPais = foneLimpo.startsWith('55') ? foneLimpo : `55${foneLimpo}`;
  const waLink = `https://wa.me/${foneComPais}`;

  const mensagemHtml = `🎨 <b>NOVO ORÇAMENTO REGISTRADO NO SITE!</b> 🎨

👤 <b>Cliente:</b> ${lead.nome}
📱 <b>WhatsApp:</b> <a href="${waLink}">${lead.telefone}</a>
🛠️ <b>Serviço:</b> ${nomeServicoAmigavel}
🚪 <b>Quantidade:</b> ${lead.quantidade_comodos} cômodo(s)
💰 <b>Valor Estimado:</b> <b>${valorFormatado}</b>
⏰ <b>Horário:</b> ${agora}

👉 <a href="${waLink}">Clique aqui para chamar o cliente no WhatsApp</a> e fechar o serviço!`;

  let enviadosComSucesso = 0;
  for (const chatId of destinatarios) {
    try {
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: mensagemHtml,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      const resultado = await response.json().catch(() => ({}));
      if (response.ok && resultado.ok) {
        enviadosComSucesso++;
      } else {
        console.warn(`[salvar-lead] Falha ao enviar para chat_id ${chatId}:`, resultado.description);
      }
    } catch (err: unknown) {
      console.error(`[salvar-lead] Erro de rede ao notificar chat ${chatId}:`, (err as Error)?.message);
    }
  }

  console.log(`[salvar-lead] Notificação enviada para ${enviadosComSucesso} de ${destinatarios.size} destinatário(s).`);
  return {
    enviado: enviadosComSucesso > 0,
    total_destinatarios: enviadosComSucesso,
    motivo: enviadosComSucesso > 0 ? undefined : 'Falha no envio para todos os destinatários',
  };
}

Deno.serve(async (req: Request) => {
  // 1. Trata preflight CORS
  const corsPreflight = handleCors(req);
  if (corsPreflight) return corsPreflight;

  // 2. Se for GET, retorna a lista de todos os leads para o Painel Administrativo
  if (req.method === 'GET') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ success: true, leads: [] });
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data, error } = await supabase
        .from('orcamentos_leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[salvar-lead] Aviso ao listar leads (RLS restrito):', error.message);
        return jsonResponse({
          success: true,
          total: 0,
          leads: [],
          aviso: error.message,
        });
      }

      return jsonResponse({
        success: true,
        total: (data || []).length,
        leads: data || [],
      });
    } catch (e) {
      return jsonResponse({
        success: true,
        total: 0,
        leads: [],
        aviso: (e as Error).message,
      });
    }
  }

  // 3. Aceita apenas POST ou GET
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido. Utilize POST ou GET.', 405);
  }

  try {
    const body: Record<string, unknown> = await req.json().catch(() => ({}));
    const nomeRaw = String(body.nome || '').trim();
    const telefoneRaw = String(body.telefone || '').trim();
    const tipoServicoRaw = String(body.tipo_servico || 'parede_lisa').trim();

    // 3. Validação com fallback e sanitização de campos
    if (!nomeRaw || nomeRaw.length < 2) {
      return errorResponse('O campo "nome" é obrigatório e deve ter pelo menos 2 caracteres.', 400);
    }

    if (!telefoneRaw || telefoneRaw.length < 8) {
      return errorResponse('O campo "telefone" é obrigatório e deve conter um número de contato válido.', 400);
    }

    // Suporta comodos ou quantidade_comodos
    const rawComodos = body.comodos !== undefined ? body.comodos : body.quantidade_comodos;
    const comodos = Math.max(1, Math.round(Number(rawComodos) || 1));

    // Suporta valor_total ou valor_calculado
    const rawValor = body.valor_total !== undefined ? body.valor_total : body.valor_calculado;
    const valorNum = Number(rawValor);
    const valorCalculado = (!isNaN(valorNum) && valorNum > 0) ? Number(valorNum.toFixed(2)) : 120.00;

    const leadSanitizado = {
      nome: nomeRaw,
      telefone: telefoneRaw,
      tipo_servico: tipoServicoRaw || 'parede_lisa',
      quantidade_comodos: comodos,
      valor_calculado: valorCalculado,
    };

    // 4. Conexão com Supabase usando SERVICE_ROLE_KEY para gravação segura
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    let leadId: string = crypto.randomUUID();
    let gravadoNoBanco = false;

    let supabaseClient: any = null;
    if (supabaseUrl && supabaseServiceKey) {
      supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

      const { data, error } = await supabaseClient
        .from('orcamentos_leads')
        .insert([leadSanitizado])
        .select('id, created_at')
        .single();

      if (error) {
        console.error('[salvar-lead] Erro ao gravar lead na tabela orcamentos_leads:', error);
        return errorResponse('Erro ao registrar lead no banco de dados.', 500, error.message);
      }

      if (data?.id) {
        leadId = String(data.id);
        gravadoNoBanco = true;
        console.log('[salvar-lead] Lead gravado com sucesso no Supabase! ID:', leadId);
      }
    } else {
      console.warn('[salvar-lead] Supabase não configurado no ambiente atual. Gerado ID simulado:', leadId);
    }

    // 5. Disparo da Notificação no Telegram (Não bloqueante para o sucesso do cliente)
    const statusTelegram = await enviarNotificacaoTelegram(leadSanitizado, supabaseClient);

    // Objeto consolidado do lead com todos os aliases
    const leadRetorno = {
      id: leadId,
      nome: leadSanitizado.nome,
      telefone: leadSanitizado.telefone,
      tipo_servico: leadSanitizado.tipo_servico,
      comodos: leadSanitizado.quantidade_comodos,
      quantidade_comodos: leadSanitizado.quantidade_comodos,
      valor_total: leadSanitizado.valor_calculado,
      valor_calculado: leadSanitizado.valor_calculado,
    };

    // 6. Retorno de sucesso ao chamador
    return jsonResponse({
      sucesso: true,
      success: true,
      lead_id: leadId,
      message: 'Lead registrado com sucesso! Notificação encaminhada ao Telegram do pintor Valdir.',
      lead: leadRetorno,
      banco_salvo: gravadoNoBanco,
      telegram_notificado: statusTelegram.enviado,
      telegram_detalhes: statusTelegram.motivo || 'Mensagem enviada com sucesso',
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[salvar-lead] Exceção inesperada:', error);
    return errorResponse('Falha ao processar salvamento do lead.', 500, error?.message);
  }
});
