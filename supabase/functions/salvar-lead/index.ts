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
 * Envia notificação assíncrona ao Telegram do pintor.
 * Trata erros internamente para nunca interromper a gravação do lead no banco.
 */
async function enviarNotificacaoTelegram(lead: {
  nome: string;
  telefone: string;
  tipo_servico: string;
  quantidade_comodos: number;
  valor_calculado: number;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

  if (!botToken || !chatId) {
    const msg = 'Variáveis TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configuradas. Notificação ignorada.';
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

  const mensagemHtml = `🎨 <b>NOVO ORÇAMENTO REGISTRADO!</b> 🎨

👤 <b>Cliente:</b> ${lead.nome}
📱 <b>WhatsApp / Telefone:</b> ${lead.telefone}
🛠️ <b>Serviço:</b> ${nomeServicoAmigavel}
🚪 <b>Quantidade de Cômodos:</b> ${lead.quantidade_comodos}
💰 <b>Valor Total Estimado:</b> ${valorFormatado}
⏰ <b>Horário:</b> ${agora}

👉 <i>Acesse o painel ou chame o cliente no WhatsApp para fechar o serviço!</i>`;

  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensagemHtml,
        parse_mode: 'HTML',
      }),
    });

    const resultado = await response.json().catch(() => ({}));

    if (!response.ok || !resultado.ok) {
      console.error('[salvar-lead] Erro na resposta da Telegram API:', resultado);
      return { enviado: false, motivo: resultado.description || 'Erro na Telegram API' };
    }

    console.log('[salvar-lead] Notificação enviada com sucesso para o Telegram!');
    return { enviado: true };
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[salvar-lead] Falha ao comunicar com Telegram Bot API:', error?.message);
    return { enviado: false, motivo: error?.message };
  }
}

Deno.serve(async (req: Request) => {
  // 1. Trata preflight CORS
  const corsPreflight = handleCors(req);
  if (corsPreflight) return corsPreflight;

  // 2. Aceita apenas POST
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido. Utilize POST.', 405);
  }

  try {
    const body: Partial<SalvarLeadPayload> = await req.json().catch(() => ({}));
    const { nome, telefone, tipo_servico, quantidade_comodos, valor_calculado } = body;

    // 3. Validação rigorosa dos campos obrigatórios
    if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
      return errorResponse('O campo "nome" é obrigatório e deve ter pelo menos 2 caracteres.', 400);
    }

    if (!telefone || typeof telefone !== 'string' || telefone.trim().length < 8) {
      return errorResponse('O campo "telefone" é obrigatório e deve conter um número de contato válido.', 400);
    }

    if (!tipo_servico || typeof tipo_servico !== 'string') {
      return errorResponse('O campo "tipo_servico" é obrigatório.', 400);
    }

    const comodos = Number(quantidade_comodos);
    if (!Number.isInteger(comodos) || comodos <= 0) {
      return errorResponse('O campo "quantidade_comodos" deve ser um número inteiro maior que zero.', 400);
    }

    const valor = Number(valor_calculado);
    if (isNaN(valor) || valor <= 0) {
      return errorResponse('O campo "valor_calculado" deve ser um valor numérico positivo.', 400);
    }

    const leadSanitizado = {
      nome: nome.trim(),
      telefone: telefone.trim(),
      tipo_servico: tipo_servico.trim(),
      quantidade_comodos: comodos,
      valor_calculado: Number(valor.toFixed(2)),
    };

    // 4. Conexão com Supabase usando SERVICE_ROLE_KEY para gravação segura
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    let leadId = crypto.randomUUID();
    let gravadoNoBanco = false;

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data, error } = await supabase
        .from('orcamentos_leads')
        .insert([leadSanitizado])
        .select('id, created_at')
        .single();

      if (error) {
        console.error('[salvar-lead] Erro ao gravar lead na tabela orcamentos_leads:', error);
        return errorResponse('Erro ao registrar lead no banco de dados.', 500, error.message);
      }

      leadId = data.id;
      gravadoNoBanco = true;
      console.log('[salvar-lead] Lead gravado com sucesso no Supabase! ID:', leadId);
    } else {
      console.warn('[salvar-lead] Supabase não configurado no ambiente atual. Gerado ID simulado:', leadId);
    }

    // 5. Disparo da Notificação no Telegram (Não bloqueante para o sucesso do cliente)
    const statusTelegram = await enviarNotificacaoTelegram(leadSanitizado);

    // 6. Retorno de sucesso ao chamador
    return jsonResponse({
      success: true,
      lead_id: leadId,
      message: 'Lead registrado com sucesso! O pintor entrará em contato em breve.',
      lead: leadSanitizado,
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
