// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// SCRIPT DE VALIDAÇÃO DE CENÁRIOS DE TESTE COM IA (test_scenarios.js)
// ============================================================================

const https = require('https');

const SUPABASE_BASE_URL = 'https://odfvajqnaeodwzaljxzm.supabase.co/functions/v1';

// Cores ANSI para saída no terminal
const ANSI = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function logHeader(title) {
  console.log(`\n${ANSI.cyan}${ANSI.bright}====================================================================${ANSI.reset}`);
  console.log(`${ANSI.cyan}${ANSI.bright}  ${title}${ANSI.reset}`);
  console.log(`${ANSI.cyan}${ANSI.bright}====================================================================${ANSI.reset}\n`);
}

function logPass(msg) {
  console.log(`  ${ANSI.green}✔ PASSOU:${ANSI.reset} ${msg}`);
}

function logFail(msg, details) {
  console.log(`  ${ANSI.red}✖ FALHOU:${ANSI.reset} ${msg}`);
  if (details) console.log(`    ${ANSI.dim}${JSON.stringify(details)}${ANSI.reset}`);
}

function postRequest(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const url = `${SUPABASE_BASE_URL}/${endpoint}`;

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 25000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, text: body, error: e.message });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout de 25s excedido na requisição.'));
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

async function runTests() {
  logHeader('TESTES DE VALIDAÇÃO DO O ORÇAMENTO NA HORA (SENAI-SP)');
  let totalTests = 0;
  let passedTests = 0;

  // --------------------------------------------------------------------------
  // PARTE 1: VALIDAÇÃO DAS REGRAS EXTRAS NO ENDPOINT calcular-orcamento
  // --------------------------------------------------------------------------
  console.log(`${ANSI.yellow}${ANSI.bright}--- PARTE 1: Validação Direta da Edge Function calcular-orcamento ---${ANSI.reset}\n`);

  // Teste 1.1: Parede com textura em 2 cômodos (2 x 180 = 360)
  totalTests++;
  try {
    const res = await postRequest('calcular-orcamento', {
      tipo_servico: 'parede_textura',
      quantidade_comodos: 2,
    });

    if (res.status === 200 && res.data.valor_final === 360) {
      logPass(`Textura em 2 cômodos: R$ 360,00 correto. Subtotal: R$ ${res.data.subtotal}, Desconto: R$ ${res.data.desconto_aplicado}`);
      passedTests++;
    } else {
      logFail(`Esperado R$ 360,00, recebido: ${res.data.valor_final}`, res.data);
    }
  } catch (err) {
    logFail('Erro ao chamar calcular-orcamento:', err.message);
  }

  // Teste 1.2: Teto em 6 cômodos com desconto de 10% (6 x 100 = 600 - 10% = 540)
  totalTests++;
  try {
    const res = await postRequest('calcular-orcamento', {
      tipo_servico: 'teto',
      quantidade_comodos: 6,
    });

    if (res.status === 200 && res.data.valor_final === 540 && res.data.desconto_aplicado === 60) {
      logPass(`Teto em 6 cômodos com 10% de desconto: R$ 540,00 correto (Subtotal: R$ 600,00, Desconto: R$ 60,00)`);
      passedTests++;
    } else {
      logFail(`Esperado R$ 540,00 com R$ 60 de desconto, recebido: ${res.data.valor_final}`, res.data);
    }
  } catch (err) {
    logFail('Erro ao chamar calcular-orcamento com desconto:', err.message);
  }

  // Teste 1.3: Taxa de visita (+ R$ 30,00)
  totalTests++;
  try {
    const res = await postRequest('calcular-orcamento', {
      tipo_servico: 'parede_lisa',
      quantidade_comodos: 2,
      taxa_visita: true,
    });

    if (res.status === 200 && res.data.valor_final === 270 && res.data.valor_taxa_visita === 30) {
      logPass(`Parede lisa em 2 cômodos com Taxa de Visita: R$ 270,00 correto (240 + 30)`);
      passedTests++;
    } else {
      logFail(`Esperado R$ 270,00 com taxa de visita de R$ 30, recebido: ${res.data.valor_final}`, res.data);
    }
  } catch (err) {
    logFail('Erro ao testar taxa de visita:', err.message);
  }

  // --------------------------------------------------------------------------
  // PARTE 2: CENÁRIOS DE DIÁLOGO END-TO-END COM A IA (Groq Tool Calling)
  // --------------------------------------------------------------------------
  console.log(`\n${ANSI.yellow}${ANSI.bright}--- PARTE 2: Cenários End-to-End com IA no Endpoint chat ---${ANSI.reset}\n`);

  // CENÁRIO 1: Cliente pede "textura em 2 cômodos"
  totalTests++;
  console.log(`${ANSI.dim}Executando Cenário 1: "Olá, quero aplicar textura em 2 cômodos."...${ANSI.reset}`);
  try {
    const res = await postRequest('chat', {
      messages: [{ role: 'user', content: 'Olá, quero aplicar textura em 2 cômodos.' }],
    });

    const action = res.data.tool_action;
    const isOrcamento = action && action.type === 'orcamento_calculado';
    const valorCorreto = action && (action.data.valor_final === 360 || action.data.valor_total === 360);

    if (res.status === 200 && isOrcamento && valorCorreto) {
      logPass(`Cenário 1: IA acionou calcular_orcamento e retornou R$ 360,00 para textura em 2 cômodos.`);
      console.log(`    ${ANSI.dim}Resposta da IA:${ANSI.reset} "${res.data.reply.slice(0, 110)}..."`);
      passedTests++;
    } else {
      logFail(`Cenário 1 não obteve a ação de orçamento esperada de R$ 360,00`, res.data);
    }
  } catch (err) {
    logFail('Falha no Cenário 1:', err.message);
  }

  // CENÁRIO 2: Cliente pede "teto em 6 cômodos" (deve acionar desconto)
  totalTests++;
  console.log(`${ANSI.dim}Executando Cenário 2: "Gostaria de pintar o teto de 6 cômodos do meu apartamento."...${ANSI.reset}`);
  try {
    const res = await postRequest('chat', {
      messages: [{ role: 'user', content: 'Gostaria de pintar o teto de 6 cômodos do meu apartamento.' }],
    });

    const action = res.data.tool_action;
    const isOrcamento = action && action.type === 'orcamento_calculado';
    const valorComDesconto = action && (action.data.valor_final === 540 || action.data.valor_total === 540);

    if (res.status === 200 && isOrcamento && valorComDesconto) {
      logPass(`Cenário 2: IA acionou calcular_orcamento e aplicou 10% de desconto (R$ 540,00 para 6 cômodos de teto).`);
      console.log(`    ${ANSI.dim}Resposta da IA:${ANSI.reset} "${res.data.reply.slice(0, 110)}..."`);
      passedTests++;
    } else {
      logFail(`Cenário 2 não obteve o valor de R$ 540,00 com desconto`, res.data);
    }
  } catch (err) {
    logFail('Falha no Cenário 2:', err.message);
  }

  // CENÁRIO 3: Cliente não informa cômodos (IA deve perguntar sem calcular de cabeça)
  totalTests++;
  console.log(`${ANSI.dim}Executando Cenário 3: "Olá! Gostaria de pintar a parede com textura, quanto custa?"...${ANSI.reset}`);
  try {
    const res = await postRequest('chat', {
      messages: [{ role: 'user', content: 'Olá! Gostaria de pintar a parede com textura, quanto custa?' }],
    });

    const action = res.data.tool_action;
    const semToolAntecipada = action === null;
    const textoPergunta = (res.data.reply || '').toLowerCase();
    const perguntouComodos = textoPergunta.includes('cômodo') || textoPergunta.includes('comodo') || textoPergunta.includes('quantos');

    if (res.status === 200 && semToolAntecipada && perguntouComodos) {
      logPass(`Cenário 3: IA NÃO inventou valores e solicitou a quantidade de cômodos antes de calcular.`);
      console.log(`    ${ANSI.dim}Resposta da IA:${ANSI.reset} "${res.data.reply.slice(0, 110)}..."`);
      passedTests++;
    } else {
      logFail(`Cenário 3: Assistente deveria perguntar os cômodos sem disparar tool.`, res.data);
    }
  } catch (err) {
    logFail('Falha no Cenário 3:', err.message);
  }

  // --------------------------------------------------------------------------
  // RESUMO FINAL
  // --------------------------------------------------------------------------
  console.log(`\n${ANSI.cyan}--------------------------------------------------------------------${ANSI.reset}`);
  console.log(`${ANSI.bright}RESULTADO FINAL: ${passedTests} de ${totalTests} testes passaram com sucesso!${ANSI.reset}`);
  console.log(`${ANSI.cyan}--------------------------------------------------------------------${ANSI.reset}\n`);

  if (passedTests === totalTests) {
    console.log(`${ANSI.green}${ANSI.bright}🎉 TODOS OS CRITÉRIOS E DESAFIOS EXTRAS VALIDADOS COM 100% DE SUCESSO!${ANSI.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${ANSI.red}${ANSI.bright}⚠️ Alguns testes falharam. Verifique os logs acima.${ANSI.reset}\n`);
    process.exit(1);
  }
}

runTests();
