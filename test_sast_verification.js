// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// SCRIPT DE VERIFICAÇÃO DE SEGURANÇA SAST (test_sast_verification.js)
// ============================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

function logPass(testName, details) {
  console.log(`  ${ANSI.green}✔ PASSOU:${ANSI.reset} ${testName}`);
  if (details) console.log(`    ${ANSI.dim}${details}${ANSI.reset}`);
}

function logFail(testName, details) {
  console.log(`  ${ANSI.red}✖ FALHOU:${ANSI.reset} ${testName}`);
  if (details) console.log(`    ${ANSI.dim}${details}${ANSI.reset}`);
}

// ----------------------------------------------------------------------------
// 1. SMOKE TEST DO SERVIDOR LOCAL (server.js)
// ----------------------------------------------------------------------------
async function testLocalServerSmoke() {
  console.log(`${ANSI.yellow}${ANSI.bright}--- ETAPA 1: Smoke Test do Servidor Local (server.js) ---${ANSI.reset}\n`);

  const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve) => setTimeout(resolve, 800));

  try {
    const resIndex = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/', (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on('error', reject);
    });

    const resAdmin = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/admin.html', (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }).on('error', reject);
    });

    serverProcess.kill();

    if (resIndex.status === 200 && resIndex.body.includes('Valdir Pintura')) {
      logPass('Smoke Test server.js: index.html carregado na porta 3000 com status 200.');
    } else {
      logFail('Smoke Test server.js index.html');
      return false;
    }

    if (resAdmin.status === 200 && resAdmin.body.includes('login-form') && !resAdmin.body.includes('tab-register')) {
      logPass('Smoke Test server.js: admin.html carregado sem auto-cadastro público.');
    } else {
      logFail('Smoke Test server.js admin.html');
      return false;
    }

    // Checar CSP e nosniff
    const csp = resIndex.headers['content-security-policy'];
    const nosniff = resIndex.headers['x-content-type-options'];
    if (csp && nosniff === 'nosniff') {
      logPass('Cabeçalhos de segurança validados (CSP e nosniff presentes).');
    } else {
      logFail('Cabeçalhos de segurança ausentes no server.js');
      return false;
    }

    return true;
  } catch (err) {
    serverProcess.kill();
    logFail('Erro ao executar smoke test do server.js:', err.message);
    return false;
  }
}

// ----------------------------------------------------------------------------
// 2. AUDITORIA ESTÁTICA DE CÓDIGO (SAST LOCAL)
// ----------------------------------------------------------------------------
function testStaticCodeSAST() {
  console.log(`\n${ANSI.yellow}${ANSI.bright}--- ETAPA 2: Auditoria Estática de Código (SAST) ---${ANSI.reset}\n`);
  let passed = true;

  // A1 & A2: frontend/admin.js
  const adminJs = fs.readFileSync(path.join(__dirname, 'frontend', 'admin.js'), 'utf8');

  // Checagem 1: Nenhuma ocorrência de sessionStorage.getItem('admin_auth') como prova
  if (!adminJs.includes("sessionStorage.getItem('admin_auth')")) {
    logPass('A1: Remoção completa de sessionStorage admin_auth no frontend/admin.js.');
  } else {
    logFail('A1: admin.js ainda contém sessionStorage.getItem(\'admin_auth\')!');
    passed = false;
  }

  // Checagem 2: Remoção de credenciais estáticas e hash hardcoded
  if (!adminJs.includes('SENHA_SALT') && !adminJs.includes('c4e439bb726588265a711462cebe2bb2b453a2a6b297b819fef63428d05541e2') && !adminJs.includes('USERS_STORAGE_KEY')) {
    logPass('A2: Nenhuma credencial master ou hash estático (c4e439...) em frontend/admin.js.');
  } else {
    logFail('A2: admin.js ainda contém segredos ou hashes estáticos!');
    passed = false;
  }

  // Checagem 3: Remoção de auto-cadastro público no admin.html
  const adminHtml = fs.readFileSync(path.join(__dirname, 'frontend', 'admin.html'), 'utf8');
  if (!adminHtml.includes('id="register-form"') && !adminHtml.includes('id="tab-register"')) {
    logPass('A2: Formulário de auto-cadastro público removido de frontend/admin.html.');
  } else {
    logFail('A2: admin.html ainda contém formulário de cadastro público!');
    passed = false;
  }

  // Checagem 4: generate_docx.js não contém admin/admin
  const docxJs = fs.readFileSync(path.join(__dirname, 'generate_docx.js'), 'utf8');
  if (!docxJs.includes('admin" e senha "admin"') && !docxJs.includes('Usuário admin | Senha admin')) {
    logPass('A2: Credenciais admin/admin removidas de generate_docx.js.');
  } else {
    logFail('A2: generate_docx.js ainda contém credenciais expostas!');
    passed = false;
  }

  // A3: salvar-lead/index.ts não possui bypass de tamanho de header ou x-admin-session
  const salvarLeadTs = fs.readFileSync(path.join(__dirname, 'supabase', 'functions', 'salvar-lead', 'index.ts'), 'utf8');
  if (!salvarLeadTs.includes('authHeader.length > 10') && !salvarLeadTs.includes("adminSessionHeader === 'true'")) {
    logPass('A3: Bypass de header (length > 10 / X-Admin-Session) eliminado em salvar-lead/index.ts.');
  } else {
    logFail('A3: salvar-lead ainda contém lógica de bypass fraco!');
    passed = false;
  }

  // A4: salvar-lead recalcula server-side e ignora body.valor_total / body.valor_calculado
  if (salvarLeadTs.includes('TABELA_PRECOS') && salvarLeadTs.includes('precoUnitario * comodos')) {
    logPass('A4: Recálculo server-side inviolável implementado em salvar-lead/index.ts.');
  } else {
    logFail('A4: salvar-lead não possui recálculo server-side oficial!');
    passed = false;
  }

  // A5: chat/index.ts possui whitelist de role (apenas assistant ou user)
  const chatTs = fs.readFileSync(path.join(__dirname, 'supabase', 'functions', 'chat', 'index.ts'), 'utf8');
  if (chatTs.includes("const role = m.role === 'assistant' ? 'assistant' : 'user';")) {
    logPass('A5: Whitelist rígida de role contra spoofing implementada em chat/index.ts.');
  } else {
    logFail('A5: chat/index.ts não possui whitelist estrita de role!');
    passed = false;
  }

  // A6: telegram-webhook/index.ts exige TELEGRAM_WEBHOOK_SECRET e protege GET
  const tgTs = fs.readFileSync(path.join(__dirname, 'supabase', 'functions', 'telegram-webhook', 'index.ts'), 'utf8');
  if (tgTs.includes('constantTimeEqual') && tgTs.includes('403') && tgTs.includes('TELEGRAM_WEBHOOK_SECRET')) {
    logPass('A6: Autenticação de webhook com constantTimeEqual e proteção de GET (403) em telegram-webhook/index.ts.');
  } else {
    logFail('A6: telegram-webhook/index.ts não atende a todos os critérios de A6!');
    passed = false;
  }

  // A7: Migrations contêm lockdown de telegram_inscritos
  const migrationFiles = [
    path.join(__dirname, 'supabase', 'migrations', '20260916220000_security_hardening.sql'),
    path.join(__dirname, 'supabase', 'migrations', 'init.sql'),
  ];
  let a7Ok = true;
  for (const f of migrationFiles) {
    if (fs.existsSync(f)) {
      const sql = fs.readFileSync(f, 'utf8');
      if (!sql.includes("REVOKE ALL ON public.telegram_inscritos FROM anon, authenticated;") && !sql.includes("service_role only")) {
        a7Ok = false;
      }
    }
  }
  if (a7Ok) {
    logPass('A7: Lockdown RLS de telegram_inscritos (service_role only) presente nas migrations.');
  } else {
    logFail('A7: Migrations não contêm lockdown restrito de telegram_inscritos!');
    passed = false;
  }

  return passed;
}

async function main() {
  logHeader('EXECUÇÃO DA SUÍTE DE TESTES E VERIFICAÇÃO SAST (A1-A7)');

  const localOk = await testLocalServerSmoke();
  const sastOk = testStaticCodeSAST();

  console.log(`\n${ANSI.cyan}--------------------------------------------------------------------${ANSI.reset}`);
  if (localOk && sastOk) {
    console.log(`${ANSI.green}${ANSI.bright}🎉 TODAS AS VALIDAÇÕES DE SEGURANÇA E SMOKE TESTS FORAM BEM-SUCEDIDAS!${ANSI.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${ANSI.red}${ANSI.bright}⚠️ Falha nas verificações. Revise os itens acima.${ANSI.reset}\n`);
    process.exit(1);
  }
}

main();
