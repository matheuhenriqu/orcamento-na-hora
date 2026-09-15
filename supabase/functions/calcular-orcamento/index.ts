// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// EDGE FUNCTION: calcular-orcamento
// DESCRIÇÃO: Valida o serviço e quantidade, consulta tabela_precos no Supabase
//            e retorna o cálculo exato do orçamento.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface CalcularOrcamentoPayload {
  tipo_servico: string;
  quantidade_comodos: number;
  taxa_visita?: boolean;
}

/**
 * Normaliza os termos enviados pelo usuário ou modelo para a chave do banco
 */
function normalizarTipoServico(termo: string): string {
  if (!termo || typeof termo !== 'string') return '';
  const limpo = termo.trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove acentos

  if (limpo.includes('textura')) {
    return 'parede_textura';
  }
  if (limpo.includes('teto')) {
    return 'teto';
  }
  if (limpo.includes('lisa') || limpo.includes('parede')) {
    return 'parede_lisa';
  }
  return limpo;
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
    const body: Partial<CalcularOrcamentoPayload> = await req.json().catch(() => ({}));
    const { tipo_servico, quantidade_comodos, taxa_visita } = body;

    // 3. Validação dos parâmetros
    if (!tipo_servico || typeof tipo_servico !== 'string') {
      return errorResponse('O campo "tipo_servico" é obrigatório e deve ser um texto válido.', 400);
    }

    const comodos = Number(quantidade_comodos);
    if (!Number.isInteger(comodos) || comodos <= 0) {
      return errorResponse('O campo "quantidade_comodos" deve ser um número inteiro maior que zero.', 400);
    }

    const servicoNormalizado = normalizarTipoServico(tipo_servico);

    // 4. Inicializa o cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    let precoUnitario = 0;
    let observacao = '';
    let nomeAmigavel = '';

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from('tabela_precos')
        .select('tipo_servico, preco_unitario, observacao')
        .eq('tipo_servico', servicoNormalizado)
        .maybeSingle();

      if (error) {
        console.warn('[calcular-orcamento] Aviso ao consultar tabela_precos (utilizando fallback de contingência oficial):', error.message);
      } else if (data) {
        precoUnitario = Number(data.preco_unitario);
        observacao = data.observacao || '';
      }
    }

    // 5. Fallback de contingência caso a variável de banco esteja ausente em teste local isolado
    // Mantém estritamente os mesmos valores oficiais invioláveis
    if (!precoUnitario) {
      const precosOficiais: Record<string, { preco: number; nome: string; obs: string }> = {
        parede_lisa: {
          preco: 120.0,
          nome: 'Parede Lisa',
          obs: 'Pintura de parede lisa por cômodo',
        },
        parede_textura: {
          preco: 180.0,
          nome: 'Parede com Textura',
          obs: 'Pintura de parede com textura por cômodo (maior complexidade/dá mais trabalho)',
        },
        teto: {
          preco: 100.0,
          nome: 'Teto',
          obs: 'Pintura de teto por cômodo',
        },
      };

      const item = precosOficiais[servicoNormalizado];
      if (!item) {
        return errorResponse(
          `Tipo de serviço inválido: "${tipo_servico}". Serviços válidos: 'parede_lisa' (R$ 120,00), 'parede_textura' (R$ 180,00), 'teto' (R$ 100,00).`,
          400
        );
      }
      precoUnitario = item.preco;
      observacao = item.obs;
      nomeAmigavel = item.nome;
    } else {
      nomeAmigavel =
        servicoNormalizado === 'parede_lisa'
          ? 'Parede Lisa'
          : servicoNormalizado === 'parede_textura'
          ? 'Parede com Textura'
          : 'Teto';
    }

    // 6. Cálculo oficial com regras extras (Desconto por quantidade e Taxa de visita)
    const subtotal = Number((precoUnitario * comodos).toFixed(2));

    // Regra Extra 1: Desconto de 10% para 5 ou mais cômodos
    const temDesconto = comodos >= 5;
    const descontoPercentual = temDesconto ? 10 : 0;
    const descontoAplicado = temDesconto ? Number((subtotal * 0.10).toFixed(2)) : 0;

    // Regra Extra 2: Taxa de visita de R$ 30,00 caso informada
    const temTaxaVisita = Boolean(taxa_visita);
    const valorTaxaVisita = temTaxaVisita ? 30.0 : 0.0;

    // Valor final com desconto e taxa de visita
    const valorFinal = Number((subtotal - descontoAplicado + valorTaxaVisita).toFixed(2));

    const resultado = {
      success: true,
      tipo_servico: servicoNormalizado,
      nome_servico: nomeAmigavel,
      quantidade_comodos: comodos,
      preco_unitario: precoUnitario,
      subtotal: subtotal,
      desconto_aplicado: descontoAplicado,
      desconto_percentual: descontoPercentual,
      taxa_visita: temTaxaVisita,
      valor_taxa_visita: valorTaxaVisita,
      valor_final: valorFinal,
      // Retrocompatibilidade
      valor_total: valorFinal,
      valor_total_formatado: `R$ ${valorFinal.toFixed(2).replace('.', ',')}`,
      observacao,
    };

    console.log('[calcular-orcamento] Sucesso no cálculo:', resultado);

    return jsonResponse(resultado);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[calcular-orcamento] Exceção inesperada:', error);
    return errorResponse('Falha ao processar cálculo do orçamento.', 500, error?.message);
  }
});
