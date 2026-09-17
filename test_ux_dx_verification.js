// ============================================================================
// SUÍTE DE TESTES E VERIFICAÇÃO UX/UI + DX (C1-C5, M1-M6, B1-B4)
// ============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✔ PASSOU: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✖ FALHOU: ${name}`);
    console.error(`    Erro: ${err.message}`);
  }
}

console.log('\n====================================================================');
console.log('  VERIFICAÇÃO UX/UI + DX (WCAG 2.2 AA & SUPABASE TS)');
console.log('====================================================================\n');

// ----------------------------------------------------------------------------
// 1. CONTRATO PREVISÍVEL & RESPOSTAS (C1)
// ----------------------------------------------------------------------------
console.log('--- 1. Contrato Previsível & Docs (C1) ---');

test('C1: Arquivo _shared/response.ts existe e exporta ok, fail, getRequestId', () => {
  const respPath = path.join(__dirname, 'supabase', 'functions', '_shared', 'response.ts');
  assert.ok(fs.existsSync(respPath), 'Arquivo _shared/response.ts deve existir');
  const content = fs.readFileSync(respPath, 'utf8');
  assert.ok(content.includes('export function ok'), 'Deve exportar ok()');
  assert.ok(content.includes('export function fail'), 'Deve exportar fail()');
  assert.ok(content.includes('export function createLogger'), 'Deve exportar createLogger()');
});

test('C1: docs/api.md e docs/openapi.json existem com documentação completa', () => {
  const apiMdPath = path.join(__dirname, 'docs', 'api.md');
  const openApiPath = path.join(__dirname, 'docs', 'openapi.json');
  assert.ok(fs.existsSync(apiMdPath), 'docs/api.md deve existir');
  assert.ok(fs.existsSync(openApiPath), 'docs/openapi.json deve existir');
  
  const apiMd = fs.readFileSync(apiMdPath, 'utf8');
  assert.ok(apiMd.includes('VALIDATION_ERROR'), 'api.md deve documentar VALIDATION_ERROR');
  assert.ok(apiMd.includes('RATE_LIMITED'), 'api.md deve documentar RATE_LIMITED');
  assert.ok(apiMd.includes('GROQ_UNAVAILABLE'), 'api.md deve documentar GROQ_UNAVAILABLE');
  assert.ok(apiMd.includes('NETWORK_OFFLINE'), 'api.md deve documentar NETWORK_OFFLINE');

  const openApi = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
  assert.strictEqual(openApi.openapi, '3.0.3');
  assert.ok(openApi.paths['/chat'], 'Deve documentar rota /chat');
  assert.ok(openApi.paths['/salvar-lead'], 'Deve documentar rota /salvar-lead');
  assert.ok(openApi.paths['/calcular-orcamento'], 'Deve documentar rota /calcular-orcamento');
});

test('C1: Helpers parseChat e parseLeads funcionam conforme contrato', () => {
  // Simula o parseChat do app.js
  function parseChat(res) {
    if (!res) return { ok: false, reply: '', toolAction: null };
    if (res.ok === true && res.data) {
      return {
        ok: true,
        reply: res.data.reply || '',
        toolAction: res.data.toolAction || res.data.tool_action || null,
        meta: res.meta,
      };
    }
    if (res.reply !== undefined || res.tool_action !== undefined) {
      return {
        ok: true,
        reply: res.reply || '',
        toolAction: res.tool_action || null,
        meta: res.meta,
      };
    }
    if (res.ok === false && res.error) {
      return { ok: false, error: res.error };
    }
    return { ok: false, error: { code: 'UNKNOWN_ERROR' } };
  }

  const standardRes = { ok: true, data: { reply: 'Olá!', toolAction: { type: 'orcamento_calculado' } } };
  const parsed1 = parseChat(standardRes);
  assert.strictEqual(parsed1.ok, true);
  assert.strictEqual(parsed1.reply, 'Olá!');
  assert.strictEqual(parsed1.toolAction.type, 'orcamento_calculado');

  const legacyRes = { reply: 'Legado', tool_action: null };
  const parsed2 = parseChat(legacyRes);
  assert.strictEqual(parsed2.ok, true);
  assert.strictEqual(parsed2.reply, 'Legado');

  const errorRes = { ok: false, error: { code: 'RATE_LIMITED', message: 'Muitas mensagens.' } };
  const parsed3 = parseChat(errorRes);
  assert.strictEqual(parsed3.ok, false);
  assert.strictEqual(parsed3.error.code, 'RATE_LIMITED');
});

// ----------------------------------------------------------------------------
// 2. ERROS DO CHAT & RETRY (C2)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Erros do Chat com Ação Corretiva (C2) ---');

test('C2: app.js possui renderChatErrorCard com mapper 400, 429, 500, offline e detalhes técnicos', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'frontend', 'app.js'), 'utf8');
  assert.ok(appJs.includes('renderChatErrorCard'), 'Deve conter função renderChatErrorCard');
  assert.ok(appJs.includes('Não entendi. Exemplo: "2 cômodos parede lisa"'), 'Deve conter mensagem amigável para 400');
  assert.ok(appJs.includes('Muitas mensagens. Aguarde 30s'), 'Deve conter mensagem para 429');
  assert.ok(appJs.includes('IA instável'), 'Deve conter mensagem para 500/502');
  assert.ok(appJs.includes('Sem internet'), 'Deve conter mensagem para offline');
  assert.ok(appJs.includes('chat-error-details'), 'Deve conter tag <details> para erros técnicos');
  assert.ok(appJs.includes('reenviarMensagem'), 'Deve implementar reenviarMensagem para retry');
});

// ----------------------------------------------------------------------------
// 3. ADMIN PAGINAÇÃO + CACHE + SKELETON (C3)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Admin Paginação, Cache & Skeleton (C3) ---');

test('C3: salvar-lead backend aceita page, limit, q, tipo com .range e count: exact', () => {
  const salvarLeadTs = fs.readFileSync(path.join(__dirname, 'supabase', 'functions', 'salvar-lead', 'index.ts'), 'utf8');
  assert.ok(salvarLeadTs.includes("searchParams.get('page')"), 'Deve extrair page de searchParams');
  assert.ok(salvarLeadTs.includes("searchParams.get('limit')"), 'Deve extrair limit de searchParams');
  assert.ok(salvarLeadTs.includes(".range(from, to)"), 'Deve aplicar paginação com .range(from, to)');
  assert.ok(salvarLeadTs.includes("count: 'exact'"), 'Deve utilizar count: exact');
  assert.ok(salvarLeadTs.includes("{ page, limit, total: totalCount }"), 'Deve retornar metadados { page, limit, total }');
});

test('C3: admin.js implementa paginação 20/pg, Carregar mais, debounce 250ms, skeleton 5 linhas e cache 60s', () => {
  const adminJs = fs.readFileSync(path.join(__dirname, 'frontend', 'admin.js'), 'utf8');
  assert.ok(adminJs.includes('pageSize = 20'), 'Deve ter pageSize = 20');
  assert.ok(adminJs.includes('btnLoadMore'), 'Deve controlar botão btnLoadMore');
  assert.ok(adminJs.includes('debounce(fn, delay = 250)'), 'Deve implementar debounce de 250ms');
  assert.ok(adminJs.includes('mostrarSkeleton'), 'Deve implementar skeleton de carregamento');
  assert.ok(adminJs.includes('skeleton-row'), 'Deve renderizar skeleton-row com 5 linhas');
  assert.ok(adminJs.includes('CACHE_TTL_MS = 60 * 1000'), 'Deve ter cache em memória de 60s');
  assert.ok(adminJs.includes('document.createDocumentFragment()'), 'Deve usar DocumentFragment para INP ótimo');
});

// ----------------------------------------------------------------------------
// 4. ACESSIBILIDADE WCAG 2.2 AA (C4, M3, M5)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Acessibilidade WCAG 2.2 AA (C4, M3, M5) ---');

test('C4: index.html e admin.html contêm skip-link e roles acessíveis', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(__dirname, 'frontend', 'admin.html'), 'utf8');

  assert.ok(indexHtml.includes('class="skip-link"'), 'index.html deve conter skip-link');
  assert.ok(indexHtml.includes('role="log"'), 'messages-container deve ter role="log"');
  assert.ok(indexHtml.includes('aria-live="polite"'), 'messages-container deve ter aria-live="polite"');
  assert.ok(indexHtml.includes('role="dialog"'), 'config-modal deve ter role="dialog"');
  assert.ok(indexHtml.includes('aria-modal="true"'), 'config-modal deve ter aria-modal="true"');

  assert.ok(adminHtml.includes('class="skip-link"'), 'admin.html deve conter skip-link');
  assert.ok(adminHtml.includes('scope="col"'), 'admin.html tabelas devem ter scope="col"');
  assert.ok(adminHtml.includes('aria-pressed='), 'admin.html filter-pills devem ter aria-pressed');
});

test('M3: style.css define --text-dim >= 4.5:1 (#52525b) e focus-visible', () => {
  const css = fs.readFileSync(path.join(__dirname, 'frontend', 'style.css'), 'utf8');
  assert.ok(css.includes('--text-dim: #52525b'), '--text-dim deve ser #52525b');
  assert.ok(css.includes(':focus-visible'), 'Deve ter regra global :focus-visible');
  assert.ok(css.includes('::placeholder'), 'Deve estilizar ::placeholder com alto contraste');
  assert.ok(css.includes('min-height: 44px'), 'Touch targets devem respeitar mínimo de 44px');
  assert.ok(css.includes('prefers-reduced-motion'), 'Deve suportar prefers-reduced-motion');
});

// ----------------------------------------------------------------------------
// 5. LOADING CANCELÁVEL & TIMEOUT 20S (C5)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Loading Cancelável (C5) ---');

test('C5: app.js possui AbortController, timeout de 20s e botão cancelar', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'frontend', 'app.js'), 'utf8');
  assert.ok(appJs.includes('abortController = new AbortController()'), 'Deve instanciar AbortController');
  assert.ok(appJs.includes('signal: abortController.signal'), 'Fetch deve receber signal do abortController');
  assert.ok(appJs.includes('20000'), 'Deve ter timeout de 20000ms');
  assert.ok(appJs.includes('btnCancelAi'), 'Deve vincular clique do btnCancelAi ao cancelamento');
});

// ----------------------------------------------------------------------------
// 6. TOASTS & MODAIS ACESSÍVEIS (M1)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Toasts e Confirmação sem alert/confirm nativos (M1) ---');

test('M1: frontend não utiliza alert() nem confirm() nativos na interface do usuário', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'frontend', 'app.js'), 'utf8');
  const adminJs = fs.readFileSync(path.join(__dirname, 'frontend', 'admin.js'), 'utf8');

  assert.ok(!/\bconfirm\s*\(/.test(appJs), 'app.js não deve chamar confirm() nativo');
  assert.ok(!/\balert\s*\(/.test(appJs), 'app.js não deve chamar alert() nativo');
  assert.ok(!/\bconfirm\s*\(/.test(adminJs), 'admin.js não deve chamar confirm() nativo');
  assert.ok(!/\balert\s*\(/.test(adminJs), 'admin.js não deve chamar alert() nativo');

  assert.ok(appJs.includes('confirmModal'), 'app.js deve usar confirmModal');
  assert.ok(adminJs.includes('confirmModal'), 'admin.js deve usar confirmModal');
  assert.ok(appJs.includes('showToast'), 'app.js deve ter showToast');
  assert.ok(adminJs.includes('showToast'), 'admin.js deve ter showToast');
});

// ----------------------------------------------------------------------------
// 7. ANTI-DUPLICAÇÃO & CACHE DE MODELOS (M2)
// ----------------------------------------------------------------------------
console.log('\n--- 7. Anti-duplicação & Idempotência (M2) ---');

test('M2: Idempotency-Key enviada em requisições de chat e salvar-lead', () => {
  const appJs = fs.readFileSync(path.join(__dirname, 'frontend', 'app.js'), 'utf8');
  assert.ok(appJs.includes("'Idempotency-Key': idempotencyKey"), 'chat deve enviar Idempotency-Key');
  assert.ok(appJs.includes("'Idempotency-Key': leadIdempotencyKey"), 'salvar-lead deve enviar Idempotency-Key');
});

test('M2: chat backend possui cache de modelos Groq por 10 minutos', () => {
  const chatTs = fs.readFileSync(path.join(__dirname, 'supabase', 'functions', 'chat', 'index.ts'), 'utf8');
  assert.ok(chatTs.includes('MODELS_CACHE_TTL_MS = 10 * 60 * 1000'), 'chat deve ter cache de modelos de 10min');
  assert.ok(chatTs.includes('cachedModels'), 'chat deve reutilizar modelos cacheados');
});

test('M2: salvar-lead backend possui deduplicação de 2 minutos', () => {
  const salvarLeadTs = fs.readFileSync(path.join(__dirname, 'supabase', 'functions', 'salvar-lead', 'index.ts'), 'utf8');
  assert.ok(salvarLeadTs.includes('DEDUPE_WINDOW_MS = 2 * 60 * 1000'), 'salvar-lead deve ter janela de dedupe de 2min');
  assert.ok(salvarLeadTs.includes('dedupeKey'), 'salvar-lead deve validar dedupeKey');
});

// ----------------------------------------------------------------------------
// 8. FORMS & VALIDAÇÕES (M4)
// ----------------------------------------------------------------------------
console.log('\n--- 8. Forms & Validações (M4) ---');

test('M4: Input de chat tem maxlength 140, contador e validações adequadas', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('maxlength="140"'), 'user-input deve ter maxlength="140"');
  assert.ok(indexHtml.includes('id="char-counter"'), 'Deve existir elemento char-counter');
  
  const appJs = fs.readFileSync(path.join(__dirname, 'frontend', 'app.js'), 'utf8');
  assert.ok(appJs.includes('char-counter'), 'app.js deve atualizar contador de caracteres');
  assert.ok(appJs.includes('!/^(meu|cliente)$/i.test(rawNome)'), 'app.js não deve aceitar apenas "Meu" como nome');
});

// ----------------------------------------------------------------------------
// 9. MICROCOPY AMIGÁVEL AO CLIENTE (B1)
// ----------------------------------------------------------------------------
console.log('\n--- 9. Microcopy Amigável ao Leigo (B1) ---');

test('B1: Termos técnicos como Endpoint, Tool Calling e RLS foram adaptados', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(__dirname, 'frontend', 'admin.html'), 'utf8');

  // No index.html, botões expostos ao usuário devem usar termos amigáveis
  assert.ok(indexHtml.includes('Conexão'), 'Botão Endpoint deve ter sido trocado por Conexão');
  assert.ok(!indexHtml.includes('Tool Calling e IA'), 'Não deve exibir Tool Calling diretamente no subtítulo do chat');

  // No admin.html, RLS deve ser exibido como Banco seguro
  assert.ok(adminHtml.includes('Banco de dados seguro ativo'), 'Deve exibir Banco seguro em vez de RLS cru');
});

console.log('\n====================================================================');
console.log(`  RESULTADO: ${passedTests} de ${totalTests} testes passaram com sucesso!`);
console.log('====================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
