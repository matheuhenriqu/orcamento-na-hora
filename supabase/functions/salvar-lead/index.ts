// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// EDGE FUNCTION: salvar-lead
// DESCRIÇÃO: Persiste os dados do lead na tabela orcamentos_leads com recálculo
//            inviolável de preços server-side, autenticação administrativa estrita
//            e notificação em tempo real via Telegram Bot API.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

// ----------------------------------------------------------------------------
// TABELA OFICIAL DE PREÇOS (INVIOLÁVEL)
// ----------------------------------------------------------------------------
const TABELA_PRECOS: Record<string, number> = {
  parede_lisa: 120.0,
  parede_textura: 180.0,
  teto: 100.0,
};

type TipoServicoValido = 'parede_lisa' | 'parede_textura' | 'teto';

function normalizarTipoServico(tipo: unknown): TipoServicoValido {
  const str = String(tipo || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (str.includes('textura')) return 'parede_textura';
  if (str.includes('teto')) return 'teto';
  return 'parede_lisa';
}

/**
 * Comparação em tempo constante para prevenir ataques de temporização (Timing Attacks)
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

/**
 * Validação rigorosa de autenticação administrativa (A3):
 * 1. x-admin-key comparado em tempo constante com ADMIN_DASHBOARD_SECRET
 * 2. apikey comparada em tempo constante com SUPABASE_SERVICE_ROLE_KEY
 * 3. JWT válido (Supabase Auth) onde app_metadata.role == 'admin' ou profile.role == 'admin'
 */
async function validarAutorizacaoAdmin(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string
): Promise<{ authorized: boolean; user?: Record<string, unknown> }> {
  const expectedAdminSecret = Deno.env.get('ADMIN_DASHBOARD_SECRET') || '';
  const adminKeyHeader = req.headers.get('x-admin-key') || '';
  if (expectedAdminSecret && constantTimeEqual(adminKeyHeader, expectedAdminSecret)) {
    return { authorized: true };
  }

  const apiKeyHeader = req.headers.get('apikey') || '';
  if (serviceKey && constantTimeEqual(apiKeyHeader, serviceKey)) {
    return { authorized: true };
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // Rejeita tokens ausentes ou curtos/inválidos
  if (!token || token.length < 20) {
    return { authorized: false };
  }

  if (!supabaseUrl || !anonKey) {
    return { authorized: false };
  }

  try {
    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
      return { authorized: false };
    }

    // Checar role admin em app_metadata ou user_metadata
    const appRole = (user.app_metadata as Record<string, unknown> | undefined)?.role;
    const userRole = (user.user_metadata as Record<string, unknown> | undefined)?.role;
    if (appRole === 'admin' || userRole === 'admin') {
      return { authorized: true, user: user as unknown as Record<string, unknown> };
    }

    // Checar perfil na tabela profiles caso serviceKey esteja disponível
    if (serviceKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceKey);
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.role === 'admin') {
        return { authorized: true, user: user as unknown as Record<string, unknown> };
      }
    }

    return { authorized: false };
  } catch (_) {
    return { authorized: false };
  }
}

/**
 * Envia notificação assíncrona a todos os inscritos autorizados no Telegram.
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
    const msg = 'TELEGRAM_BOT_TOKEN não configurado nas variáveis de ambiente.';
    console.warn(`[salvar-lead] ${msg}`);
    return { enviado: false, motivo: msg };
  }

  const destinatarios = new Set<string | number>();
  const envChatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (envChatId) destinatarios.add(envChatId);

  const adminChatsStr = Deno.env.get('TELEGRAM_ADMIN_CHATS') || '';
  const adminChats = adminChatsStr.split(',').map((s) => s.trim()).filter(Boolean);

  if (supabaseClient) {
    try {
      const { data: inscritos, error } = await supabaseClient
        .from('telegram_inscritos')
        .select('chat_id');

      if (!error && inscritos) {
        inscritos.forEach((item: { chat_id: number | string }) => {
          const cidStr = String(item.chat_id);
          if (cidStr === String(envChatId) || adminChats.includes(cidStr)) {
            destinatarios.add(item.chat_id);
          }
        });
      }
    } catch (e) {
      console.warn('[salvar-lead] Não foi possível consultar telegram_inscritos:', (e as Error).message);
    }
  }

  if (destinatarios.size === 0) {
    return { enviado: false, motivo: 'Nenhum destinatário do Telegram configurado' };
  }

  const servicoNome =
    lead.tipo_servico === 'parede_textura'
      ? 'Parede com Textura'
      : lead.tipo_servico === 'teto'
      ? 'Teto'
      : 'Parede Lisa';

  const telFormatado = lead.telefone.replace(/\D/g, '');
  const linkWhatsApp = `https://wa.me/55${telFormatado}`;

  const mensagemTexto =
    `🔔 *NOVO LEAD CAPTURADO!*\n\n` +
    `👤 *Cliente:* ${lead.nome}\n` +
    `📞 *Telefone:* \`${lead.telefone}\`\n` +
    `🛠 *Serviço:* ${servicoNome}\n` +
    `🏠 *Cômodos:* ${lead.quantidade_comodos}\n` +
    `💰 *Valor Estimado:* R$ ${lead.valor_calculado.toFixed(2).replace('.', ',')}\n\n` +
    `💬 [Chamar no WhatsApp](${linkWhatsApp})\n` +
    `_Orçamento gerado automaticamente via Assistente IA_`;

  let enviadosComSucesso = 0;

  for (const chatId of destinatarios) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: mensagemTexto,
          parse_mode: 'Markdown',
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  // ==========================================================================
  // 2. REQUISIÇÕES GET: LISTAGEM DE LEADS (PROTEÇÃO A3 - LGPD)
  // ==========================================================================
  if (req.method === 'GET') {
    const authCheck = await validarAutorizacaoAdmin(req, supabaseUrl, supabaseAnonKey, supabaseServiceKey);
    if (!authCheck.authorized) {
      return errorResponse('Acesso não autorizado.', 401);
    }

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
        console.warn('[salvar-lead] Aviso ao listar leads:', error.message);
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

  // ==========================================================================
  // 3. REQUISIÇÕES POST: CRIAÇÃO DE LEADS E AÇÕES ADMINISTRATIVAS
  // ==========================================================================
  if (req.method !== 'POST') {
    return errorResponse('Método não permitido. Utilize POST ou GET.', 405);
  }

  try {
    const rawInput: Record<string, unknown> = await req.json().catch(() => ({}));
    const body = ((rawInput.lead || rawInput.data || rawInput.args || rawInput) as Record<string, unknown>) || {};

    // ------------------------------------------------------------------------
    // SUB-AÇÕES ADMINISTRATIVAS (GESTÃO DE USUÁRIOS AUTH - A2)
    // ------------------------------------------------------------------------
    if (body.action === 'create_user') {
      const authCheck = await validarAutorizacaoAdmin(req, supabaseUrl, supabaseAnonKey, supabaseServiceKey);
      if (!authCheck.authorized) {
        return errorResponse('Acesso não autorizado para cadastro de operadores.', 401);
      }

      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const nome = String(body.nome || '').trim();
      const role = String(body.role || 'atendente').trim().toLowerCase();

      if (!email || !password || !nome) {
        return errorResponse('Os campos email, senha e nome são obrigatórios.', 400);
      }

      if (password.length < 12) {
        return errorResponse('A senha deve conter no mínimo 12 caracteres conforme política de segurança.', 400);
      }

      if (!['admin', 'atendente', 'pintor'].includes(role)) {
        return errorResponse('Perfil inválido. Perfis aceitos: admin, atendente, pintor.', 400);
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome, role },
        app_metadata: { role },
      });

      if (createError || !newUser?.user) {
        return errorResponse(createError?.message || 'Erro ao criar usuário no Supabase Auth.', 400);
      }

      // Sincronizar na tabela profiles
      await supabaseAdmin.from('profiles').upsert({
        id: newUser.user.id,
        email,
        nome,
        role,
        updated_at: new Date().toISOString(),
      });

      return jsonResponse({
        success: true,
        message: `Usuário ${email} cadastrado com sucesso!`,
        user: { id: newUser.user.id, email, nome, role },
      });
    }

    if (body.action === 'list_users') {
      const authCheck = await validarAutorizacaoAdmin(req, supabaseUrl, supabaseAnonKey, supabaseServiceKey);
      if (!authCheck.authorized) {
        return errorResponse('Acesso não autorizado.', 401);
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: profiles, error: pError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      return jsonResponse({
        success: true,
        users: profiles || [],
        error: pError?.message,
      });
    }

    if (body.action === 'delete_user') {
      const authCheck = await validarAutorizacaoAdmin(req, supabaseUrl, supabaseAnonKey, supabaseServiceKey);
      if (!authCheck.authorized) {
        return errorResponse('Acesso não autorizado.', 401);
      }

      const userId = String(body.user_id || '').trim();
      if (!userId) {
        return errorResponse('O identificador user_id é obrigatório.', 400);
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin.from('profiles').delete().eq('id', userId);

      return jsonResponse({ success: true, message: 'Usuário removido com sucesso.' });
    }

    // ------------------------------------------------------------------------
    // FLUXO PRINCIPAL: SALVAMENTO DE LEAD COM RECÁLCULO SERVER-SIDE (A4)
    // ------------------------------------------------------------------------
    let nomeRaw = String(body.nome || '').trim();
    if (!nomeRaw || nomeRaw.length < 2) {
      nomeRaw = 'Cliente';
    }
    const telefoneRaw = String(body.telefone || '').trim();

    if (!telefoneRaw || telefoneRaw.replace(/\D/g, '').length < 8) {
      return errorResponse('O campo "telefone" é obrigatório e deve conter um número de contato válido.', 400);
    }

    // Suporta comodos ou quantidade_comodos
    const rawComodos = body.comodos !== undefined ? body.comodos : body.quantidade_comodos;
    const comodos = Math.max(1, Math.round(Number(rawComodos) || 1));

    // A4: Validação estrita de tipo_servico e RECÁLCULO OBRIGATÓRIO server-side.
    // Ignora body.valor_total e body.valor_calculado enviados pelo cliente.
    const tipoServico = normalizarTipoServico(body.tipo_servico);
    const precoUnitario = TABELA_PRECOS[tipoServico];
    const subtotal = precoUnitario * comodos;
    const desconto = comodos >= 5 ? subtotal * 0.10 : 0;
    const temTaxaVisita = body.taxa_visita === true || String(body.taxa_visita) === 'true';
    const taxa = temTaxaVisita ? 30.0 : 0.0;
    const valorCalculadoOficial = Number((subtotal - desconto + taxa).toFixed(2));

    const leadSanitizado = {
      nome: nomeRaw,
      telefone: telefoneRaw,
      tipo_servico: tipoServico,
      quantidade_comodos: comodos,
      valor_calculado: valorCalculadoOficial,
    };

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

    // Notificação Telegram em segundo plano
    const statusTelegram = await enviarNotificacaoTelegram(leadSanitizado, supabaseClient);

    return jsonResponse({
      success: true,
      message: 'Orçamento e dados do lead registrados com sucesso!',
      lead_id: leadId,
      gravado_no_banco: gravadoNoBanco,
      lead: {
        id: leadId,
        ...leadSanitizado,
        subtotal,
        desconto,
        taxa_visita: temTaxaVisita,
        valor_final: valorCalculadoOficial,
      },
      notificacao_telegram: statusTelegram,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[salvar-lead] Exceção inesperada ao salvar lead:', error);
    return errorResponse('Falha ao processar e salvar o lead.', 500, error?.message);
  }
});
