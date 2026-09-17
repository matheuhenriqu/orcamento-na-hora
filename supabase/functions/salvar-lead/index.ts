// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// EDGE FUNCTION: salvar-lead
// DESCRIÇÃO: Persiste os dados do lead com paginação real, recálculo server-side
//            inviolável, deduplicação em memória (M2), autenticação administrativa
//            e respostas padronizadas (C1 / C3).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { handleCors } from '../_shared/cors.ts';
import { ok, fail, createLogger } from '../_shared/response.ts';

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
 * Cache de deduplicação em memória (2 minutos) contra disparos repetidos (M2)
 */
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

interface DedupeEntry {
  leadId: string;
  lead: Record<string, unknown>;
  timestamp: number;
}
const dedupeCache = new Map<string, DedupeEntry>();

function cleanDedupeCache() {
  const now = Date.now();
  for (const [k, v] of dedupeCache.entries()) {
    if (now - v.timestamp > DEDUPE_WINDOW_MS) {
      dedupeCache.delete(k);
    }
  }
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
 * Validação rigorosa de autenticação administrativa (A3 / C1)
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

    const appRole = (user.app_metadata as Record<string, unknown> | undefined)?.role;
    const userRole = (user.user_metadata as Record<string, unknown> | undefined)?.role;
    if (appRole === 'admin' || userRole === 'admin') {
      return { authorized: true, user: user as unknown as Record<string, unknown> };
    }

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
    return { enviado: false, motivo: 'TELEGRAM_BOT_TOKEN não configurado.' };
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
    } catch (_) {}
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
      }
    } catch (_) {}
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

  const logger = createLogger('salvar-lead', req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  // ==========================================================================
  // 2. REQUISIÇÕES GET: LISTAGEM DE LEADS COM PAGINAÇÃO REAL (C3)
  // ==========================================================================
  if (req.method === 'GET') {
    const authCheck = await validarAutorizacaoAdmin(req, supabaseUrl, supabaseAnonKey, supabaseServiceKey);
    if (!authCheck.authorized) {
      return fail('UNAUTHORIZED', 'Acesso não autorizado.', 'Faça login com credenciais de administrador.', 401, undefined, req);
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return ok({ leads: [] }, { page: 1, limit: 20, total: 0 }, req, { leads: [], total: 0 });
    }

    try {
      const urlObj = new URL(req.url);
      const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1', 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get('limit') || '20', 10) || 20));
      const q = (urlObj.searchParams.get('q') || '').trim();
      const tipo = (urlObj.searchParams.get('tipo') || '').trim();

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      let query = supabase
        .from('orcamentos_leads')
        .select('*', { count: 'exact' });

      if (tipo && tipo !== 'todos') {
        query = query.eq('tipo_servico', tipo);
      }
      if (q) {
        query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`);
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        logger.warn('Aviso ao listar leads:', error.message);
        return ok({ leads: [] }, { page, limit, total: 0, error: error.message }, req, { leads: [], total: 0 });
      }

      const leadsList = data || [];
      const totalCount = count !== null ? count : leadsList.length;

      logger.info(`Leads consultados com sucesso. Página: ${page}, Retornados: ${leadsList.length}, Total: ${totalCount}`);

      return ok(
        { leads: leadsList },
        { page, limit, total: totalCount },
        req,
        {
          total: totalCount,
          leads: leadsList,
        }
      );
    } catch (e) {
      logger.error('Erro ao consultar leads:', e);
      return ok({ leads: [] }, { page: 1, limit: 20, total: 0 }, req, { leads: [], total: 0 });
    }
  }

  // ==========================================================================
  // 3. REQUISIÇÕES POST: CRIAÇÃO DE LEADS E AÇÕES ADMINISTRATIVAS
  // ==========================================================================
  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 'Método não permitido. Utilize POST ou GET.', 'Envie uma requisição POST ou GET.', 405, undefined, req);
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
        return fail('UNAUTHORIZED', 'Acesso não autorizado para cadastro de operadores.', 'Autentique-se como administrador.', 401, undefined, req);
      }

      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const nome = String(body.nome || '').trim();
      const role = String(body.role || 'atendente').trim().toLowerCase();

      if (!email || !password || !nome) {
        return fail('VALIDATION_ERROR', 'Os campos email, senha e nome são obrigatórios.', 'Preencha todos os campos do formulário.', 400, undefined, req);
      }

      if (password.length < 12) {
        return fail('WEAK_PASSWORD', 'A senha deve conter no mínimo 12 caracteres.', 'Crie uma senha forte com ao menos 12 caracteres, maiúscula, minúscula, número e símbolo.', 400, undefined, req);
      }

      if (!['admin', 'atendente', 'pintor'].includes(role)) {
        return fail('INVALID_ROLE', 'Perfil inválido.', 'Escolha um dos perfis aceitos: admin, atendente ou pintor.', 400, undefined, req);
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
        return fail('AUTH_USER_CREATION_FAILED', createError?.message || 'Erro ao criar usuário no Supabase Auth.', 'Verifique se o e-mail já não está cadastrado.', 400, undefined, req);
      }

      await supabaseAdmin.from('profiles').upsert({
        id: newUser.user.id,
        email,
        nome,
        role,
        updated_at: new Date().toISOString(),
      });

      return ok(
        { user: { id: newUser.user.id, email, nome, role } },
        undefined,
        req,
        {
          message: `Usuário ${email} cadastrado com sucesso!`,
          user: { id: newUser.user.id, email, nome, role },
        }
      );
    }

    if (body.action === 'list_users') {
      const authCheck = await validarAutorizacaoAdmin(req, supabaseUrl, supabaseAnonKey, supabaseServiceKey);
      if (!authCheck.authorized) {
        return fail('UNAUTHORIZED', 'Acesso não autorizado.', 'Autentique-se como administrador.', 401, undefined, req);
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: profiles, error: pError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      return ok(
        { users: profiles || [] },
        undefined,
        req,
        {
          users: profiles || [],
          error: pError?.message,
        }
      );
    }

    if (body.action === 'delete_user') {
      const authCheck = await validarAutorizacaoAdmin(req, supabaseUrl, supabaseAnonKey, supabaseServiceKey);
      if (!authCheck.authorized) {
        return fail('UNAUTHORIZED', 'Acesso não autorizado.', 'Autentique-se como administrador.', 401, undefined, req);
      }

      const userId = String(body.user_id || '').trim();
      if (!userId) {
        return fail('VALIDATION_ERROR', 'O identificador user_id é obrigatório.', 'Informe o ID do operador a ser excluído.', 400, undefined, req);
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin.from('profiles').delete().eq('id', userId);

      return ok({ deleted: true }, undefined, req, { message: 'Usuário removido com sucesso.' });
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
      return fail('INVALID_PHONE', 'O campo "telefone" é obrigatório e deve conter um número de contato válido.', 'Informe um WhatsApp com DDD válido (ex: 11999998888).', 400, undefined, req);
    }

    // Suporta comodos ou quantidade_comodos
    const rawComodos = body.comodos !== undefined ? body.comodos : body.quantidade_comodos;
    const comodos = Math.max(1, Math.round(Number(rawComodos) || 1));

    // A4: Recálculo obrigatório e inviolável
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

    // M2: Verificação de deduplicação recente (2 minutos)
    cleanDedupeCache();
    const idempotencyKey = req.headers.get('idempotency-key') || '';
    const dedupeKey = idempotencyKey || `${telefoneRaw}_${tipoServico}_${comodos}_${valorCalculadoOficial}`;
    const cached = dedupeCache.get(dedupeKey);
    if (cached && (Date.now() - cached.timestamp) < 2 * 60 * 1000) {
      logger.info('Lead duplicado detectado no intervalo de 2 minutos. Retornando lead existente.');
      return ok(
        { lead: cached.lead },
        { deduplicated: true },
        req,
        {
          lead_id: cached.leadId,
          lead: cached.lead,
          gravado_no_banco: true,
          message: 'Orçamento já registrado recentemente.',
        }
      );
    }

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
        logger.error('Erro ao gravar lead na tabela orcamentos_leads:', error);
        return fail('DATABASE_ERROR', 'Erro ao registrar lead no banco de dados.', 'Tente novamente em instantes.', 500, error.message, req);
      }

      if (data?.id) {
        leadId = String(data.id);
        gravadoNoBanco = true;
        logger.info(`Lead gravado com sucesso no Supabase! ID: ${leadId}`);
      }
    } else {
      logger.warn('Supabase não configurado no ambiente atual. Gerado ID simulado.');
    }

    const leadCompleto = {
      id: leadId,
      ...leadSanitizado,
      subtotal,
      desconto,
      taxa_visita: temTaxaVisita,
      valor_final: valorCalculadoOficial,
    };

    // Registrar no cache de deduplicação
    dedupeCache.set(dedupeKey, {
      leadId,
      lead: leadCompleto,
      timestamp: Date.now(),
    });

    // Notificação Telegram em segundo plano
    const statusTelegram = await enviarNotificacaoTelegram(leadSanitizado, supabaseClient);

    return ok(
      { lead: leadCompleto },
      undefined,
      req,
      {
        message: 'Orçamento e dados do lead registrados com sucesso!',
        lead_id: leadId,
        gravado_no_banco: gravadoNoBanco,
        lead: leadCompleto,
        notificacao_telegram: statusTelegram,
      }
    );
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Exceção inesperada ao salvar lead:', error);
    return fail('INTERNAL_SERVER_ERROR', 'Falha ao processar e salvar o lead.', 'Tente novamente mais tarde.', 500, error?.message, req);
  }
});
