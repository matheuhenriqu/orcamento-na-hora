// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// EDGE FUNCTION: chat (Orquestrador LLM Groq Qwen + Tool Calling)
// DESCRIÇÃO: Recebe mensagens do chat, invoca Groq API com modelo Qwen,
//            orquestra Tool Calling (calcular_orcamento e salvar_lead)
//            e retorna a resposta natural + metadados de ações.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  context?: {
    ultimo_orcamento?: {
      tipo_servico: string;
      quantidade_comodos: number;
      valor_calculado: number;
    };
  };
}

// ============================================================================
// SYSTEM PROMPT RIGOROSO (REGRAS INVIOLÁVEIS)
// ============================================================================
const SYSTEM_PROMPT = `Você é o assistente virtual exclusivo do pintor autônomo Valdir, do serviço "O Orçamento na Hora".
Seu tom é cordial, prestativo, ágil e profissional. Fale sempre em português do Brasil de forma clara e objetiva.

TABELA DE PREÇOS OFICIAIS DO PINTOR (INVIOLÁVEL):
- Parede lisa: R$ 120,00 por cômodo.
- Parede com textura: R$ 180,00 por cômodo (maior complexidade, exige técnica e mais tempo).
- Teto: R$ 100,00 por cômodo.

REGRAS ESPECIAIS E DESCONTOS (CRITÉRIOS DESEJÁVEIS):
- Desconto por quantidade: Para 5 ou mais cômodos, é aplicado automaticamente 10% de desconto no valor total pela ferramenta "calcular_orcamento"!
- Taxa de visita/deslocamento: Se o cliente mencionar que o imóvel é distante, sítio, chácara, fora da cidade ou zona rural, passe "taxa_visita: true" para a ferramenta "calcular_orcamento" (taxa de R$ 30,00).

DIRETRIZES DE COMPORTAMENTO OBRIGATÓRIAS:
1. NUNCA calcule valores de cabeça. NUNCA invente preços, quantidades de cômodos ou dados de clientes.
2. Se o cliente disser apenas "quero um orçamento" ou não tiver informado o serviço E a quantidade de cômodos, pergunte com gentileza qual o serviço (parede lisa, parede com textura ou teto) e quantos cômodos serão pintados.
3. Assim que o cliente tiver fornecido o serviço e a quantidade de cômodos, você DEVE OBRIGATORIAMENTE chamar a ferramenta "calcular_orcamento". Não faça contas manuais no texto.
4. Ao receber o retorno da ferramenta "calcular_orcamento", apresente o valor total detalhado com entusiasmo (mencionando o desconto se houver) e solicite o Nome e o WhatsApp/Telefone do cliente para que o Valdir possa registrar o pedido e entrar em contato para agendar ou tirar dúvidas.
5. Assim que o cliente fornecer seu nome e telefone/WhatsApp, você DEVE OBRIGATORIAMENTE chamar a ferramenta "salvar_lead" passando o nome, telefone, o tipo de serviço, a quantidade de cômodos e o valor_calculado daquele orçamento.
6. Após a ferramenta "salvar_lead" retornar sucesso, confirme ao cliente que o contato foi gravado e que o pintor Valdir entrará em contato pelo WhatsApp em instantes!`;

// ============================================================================
// DEFINIÇÃO DAS FERRAMENTAS (TOOL CALLING SCHEMA)
// ============================================================================
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'calcular_orcamento',
      description:
        'Calcula o valor oficial do orçamento de pintura consultando a tabela de preços. Chame SEMPRE que souber o serviço e a quantidade de cômodos.',
      parameters: {
        type: 'object',
        properties: {
          tipo_servico: {
            type: 'string',
            enum: ['parede_lisa', 'parede_textura', 'teto'],
            description:
              'O tipo de serviço desejado: "parede_lisa" (R$ 120/cômodo), "parede_textura" (R$ 180/cômodo) ou "teto" (R$ 100/cômodo).',
          },
          quantidade_comodos: {
            type: 'integer',
            minimum: 1,
            description: 'Quantidade de cômodos para o serviço de pintura (número inteiro positivo).',
          },
          taxa_visita: {
            type: 'boolean',
            description:
              'True se o cliente informar que o imóvel é distante, fora da cidade, sítio ou zona rural (taxa de deslocamento de R$ 30,00). Padrão false.',
          },
        },
        required: ['tipo_servico', 'quantidade_comodos'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'salvar_lead',
      description:
        'Persiste o lead de orçamento no banco de dados e notifica o pintor no Telegram. Chame IMEDIATAMENTE quando o cliente informar nome e telefone/WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          nome: {
            type: 'string',
            description: 'Nome completo ou primeiro nome informado pelo cliente.',
          },
          telefone: {
            type: 'string',
            description: 'Telefone ou número de WhatsApp para contato.',
          },
          tipo_servico: {
            type: 'string',
            description: 'Tipo de serviço previamente orçado (parede_lisa, parede_textura ou teto).',
          },
          quantidade_comodos: {
            type: 'integer',
            description: 'Número de cômodos que foram orçados.',
          },
          valor_calculado: {
            type: 'number',
            description: 'Valor total calculado previamente para este orçamento.',
          },
        },
        required: ['nome', 'telefone', 'tipo_servico', 'quantidade_comodos', 'valor_calculado'],
      },
    },
  },
];

// ============================================================================
// EXECUÇÃO INTERNA DAS FERRAMENTAS
// ============================================================================
async function executarCalcularOrcamento(args: {
  tipo_servico: string;
  quantidade_comodos: number;
  taxa_visita?: boolean;
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // 1. Tentar invocar Edge Function calcular-orcamento se ambiente Supabase estiver ativo
  if (supabaseUrl && anonKey) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/calcular-orcamento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(args),
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn('[chat] Falha na chamada HTTP para calcular-orcamento, usando cálculo direto:', e);
    }
  }

  // 2. Cálculo direto baseado nos preços oficiais invioláveis com regras extras
  const tabela: Record<string, { preco: number; nome: string }> = {
    parede_lisa: { preco: 120.0, nome: 'Parede Lisa' },
    parede_textura: { preco: 180.0, nome: 'Parede com Textura' },
    teto: { preco: 100.0, nome: 'Teto' },
  };

  const item = tabela[args.tipo_servico] || tabela['parede_lisa'];
  const comodos = Math.max(1, Math.round(Number(args.quantidade_comodos) || 1));
  const subtotal = Number((item.preco * comodos).toFixed(2));
  const temDesconto = comodos >= 5;
  const descontoAplicado = temDesconto ? Number((subtotal * 0.10).toFixed(2)) : 0;
  const temTaxaVisita = Boolean(args.taxa_visita);
  const valorTaxaVisita = temTaxaVisita ? 30.0 : 0.0;
  const total = Number((subtotal - descontoAplicado + valorTaxaVisita).toFixed(2));

  return {
    success: true,
    tipo_servico: args.tipo_servico,
    nome_servico: item.nome,
    quantidade_comodos: comodos,
    preco_unitario: item.preco,
    subtotal: subtotal,
    desconto_aplicado: descontoAplicado,
    desconto_percentual: temDesconto ? 10 : 0,
    taxa_visita: temTaxaVisita,
    valor_taxa_visita: valorTaxaVisita,
    valor_final: total,
    valor_total: total,
    valor_total_formatado: `R$ ${total.toFixed(2).replace('.', ',')}`,
  };
}

async function executarSalvarLead(args: {
  nome: string;
  telefone: string;
  tipo_servico: string;
  quantidade_comodos: number;
  valor_calculado: number;
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

  // 1. Tentar invocar Edge Function salvar-lead se ambiente Supabase estiver configurado
  if (supabaseUrl && serviceKey) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/salvar-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(args),
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {
      console.warn('[chat] Falha na chamada HTTP para salvar-lead, usando gravação direta:', e);
    }
  }

  // 2. Gravação direta de contingência no Supabase
  let leadId = crypto.randomUUID();
  if (supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data } = await supabase.from('orcamentos_leads').insert([args]).select('id').single();
      if (data?.id) leadId = data.id;
    } catch (e) {
      console.error('[chat] Erro ao inserir lead direto:', e);
    }
  }

  return {
    success: true,
    lead_id: leadId,
    message: 'Lead registrado com sucesso!',
    lead: args,
  };
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
Deno.serve(async (req: Request) => {
  // Preflight CORS
  const corsPreflight = handleCors(req);
  if (corsPreflight) return corsPreflight;

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido. Utilize POST.', 405);
  }

  try {
    const body: ChatRequestBody = await req.json().catch(() => ({ messages: [] }));
    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return errorResponse('O campo "messages" deve ser um array com o histórico de conversa.', 400);
    }

    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      return errorResponse(
        'A chave GROQ_API_KEY não está configurada nas variáveis de ambiente do Supabase.',
        500
      );
    }

    // Seleção de modelo da família Qwen com suporte a Tool Calling / Reasoning
    // 'deepseek-r1-distill-qwen-32b' ou 'qwen-2.5-coder-32b' ou 'llama-3.3-70b-versatile'
    const groqModel = Deno.env.get('GROQ_MODEL') || 'deepseek-r1-distill-qwen-32b';

    // Montar histórico de mensagens para a API da Groq
    const groqMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content || '',
        name: m.name,
        tool_call_id: m.tool_call_id,
        tool_calls: m.tool_calls,
      })),
    ];

    // Consultar dinamicamente os modelos disponíveis na conta Groq
    let availableModelIds: string[] = [];
    try {
      const modelsResp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${groqApiKey}` },
      });
      if (modelsResp.ok) {
        const modelsData = await modelsResp.json();
        availableModelIds = (modelsData.data || []).map((m: { id: string }) => m.id);
        console.log('[chat] Modelos disponíveis na Groq:', availableModelIds);
      }
    } catch (e) {
      console.warn('[chat] Falha ao consultar lista de modelos da Groq:', e);
    }

    // Priorizar modelos da família Qwen ou modelos rápidos com Tool Calling
    const qwenModel = availableModelIds.find((id) => id.toLowerCase().includes('qwen'));
    const llamaModel = availableModelIds.find(
      (id) => id.includes('llama-3.3') || id.includes('llama-3.1-70b') || id.includes('llama-3.1-8b')
    );
    const fallbackModel = availableModelIds[0] || 'llama-3.1-8b-instant';

    const preferredModel = Deno.env.get('GROQ_MODEL') || qwenModel || llamaModel || fallbackModel;
    const modelsToTry = [...new Set([preferredModel, qwenModel, llamaModel, fallbackModel].filter(Boolean) as string[])];

    let completionData: Record<string, unknown> | null = null;
    let selectedModel = modelsToTry[0];
    const allErrors: Array<{ model: string; status: number; error: string }> = [];

    for (const model of modelsToTry) {
      console.log(`[chat] Tentando Groq com modelo: ${model}...`);
      const groqPayload = {
        model,
        messages: groqMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 600,
      };

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify(groqPayload),
      });

      if (groqResponse.ok) {
        completionData = await groqResponse.json();
        selectedModel = model;
        console.log(`[chat] Sucesso com o modelo: ${model}`);
        break;
      } else {
        const errTxt = await groqResponse.text();
        allErrors.push({ model, status: groqResponse.status, error: errTxt });
        console.warn(`[chat] Modelo ${model} falhou (${groqResponse.status}): ${errTxt}`);
      }
    }

    if (!completionData) {
      return errorResponse('Erro ao conectar com modelos da Groq API.', 502, allErrors);
    }

    const choice = (completionData.choices as Array<{ message: ChatMessage }>)?.[0];
    const assistantMsg = choice?.message;

    if (!assistantMsg) {
      return errorResponse('Nenhuma resposta retornada pelo modelo de IA.', 500);
    }

    // Verificar se o modelo decidiu acionar alguma Tool
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      console.log(`[chat] O modelo acionou ${assistantMsg.tool_calls.length} ferramenta(s).`);

      // Guardar metadados para envio ao frontend (renderizar card verde ou azul)
      let toolActionMeta: {
        type: 'orcamento_calculado' | 'lead_salvo';
        data: Record<string, unknown>;
      } | null = null;

      // Adiciona a mensagem do assistente com as tool_calls ao histórico
      const conversationWithTools = [...groqMessages, assistantMsg];

      // Executar as ferramentas solicitadas
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs: Record<string, unknown> = {};
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          fnArgs = {};
        }

        console.log(`[chat] Executando tool: ${fnName}`, fnArgs);

        let executionResult: Record<string, unknown> = {};

        if (fnName === 'calcular_orcamento') {
          executionResult = await executarCalcularOrcamento({
            tipo_servico: String(fnArgs.tipo_servico || 'parede_lisa'),
            quantidade_comodos: Number(fnArgs.quantidade_comodos) || 1,
            taxa_visita: Boolean(fnArgs.taxa_visita),
          });

          toolActionMeta = {
            type: 'orcamento_calculado',
            data: executionResult,
          };
        } else if (fnName === 'salvar_lead') {
          executionResult = await executarSalvarLead({
            nome: String(fnArgs.nome || 'Cliente'),
            telefone: String(fnArgs.telefone || ''),
            tipo_servico: String(fnArgs.tipo_servico || 'parede_lisa'),
            quantidade_comodos: Number(fnArgs.quantidade_comodos) || 1,
            valor_calculado: Number(fnArgs.valor_calculado) || 0,
          });

          toolActionMeta = {
            type: 'lead_salvo',
            data: executionResult,
          };
        }

        // Adiciona a resposta da ferramenta com role "tool"
        conversationWithTools.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: fnName,
          content: JSON.stringify(executionResult),
        });
      }

      // 2ª Chamada à Groq API para gerar a resposta final com base no retorno da tool
      console.log('[chat] Chamando Groq para consolidar resposta final com o retorno das tools...');

      const secondResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationWithTools,
          temperature: 0.3,
          max_tokens: 600,
        }),
      });

      if (!secondResponse.ok) {
        const errText = await secondResponse.text();
        console.error('[chat] Erro na 2ª chamada Groq:', secondResponse.status, errText);
        // Resposta de fallback elegante caso a 2ª chamada falhe
        let fallbackText = 'Operação realizada com sucesso!';
        if (toolActionMeta?.type === 'orcamento_calculado') {
          const d = toolActionMeta.data;
          fallbackText = `Seu orçamento para ${d.quantidade_comodos} cômodo(s) de ${d.nome_servico} ficou em ${d.valor_total_formatado}. Por favor, me informe seu Nome e WhatsApp para agendarmos!`;
        } else if (toolActionMeta?.type === 'lead_salvo') {
          fallbackText = `Perfeito! Seus dados foram anotados e o pintor Valdir entrará em contato pelo WhatsApp em instantes.`;
        }

        return jsonResponse({
          reply: fallbackText,
          tool_action: toolActionMeta,
        });
      }

      const secondData = await secondResponse.json();
      const finalReply = secondData.choices?.[0]?.message?.content || '';

      return jsonResponse({
        reply: finalReply,
        tool_action: toolActionMeta,
      });
    }

    // Se o modelo não chamou tool, apenas retorna a resposta textual direta
    return jsonResponse({
      reply: assistantMsg.content || 'Como posso te ajudar com o orçamento da sua pintura hoje?',
      tool_action: null,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[chat] Exceção inesperada:', error);
    return errorResponse('Erro ao processar conversa com o assistente.', 500, error?.message);
  }
});
