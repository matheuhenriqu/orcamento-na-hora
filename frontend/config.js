// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// CONFIGURAÇÃO DO FRONTEND
// ============================================================================

function getValidFunctionsUrl() {
  const DEFAULT_URL = 'https://odfvajqnaeodwzaljxzm.supabase.co/functions/v1';
  const custom = window.localStorage.getItem('orcamento_functions_url');
  if (!custom) return DEFAULT_URL;

  try {
    const parsed = new URL(custom);
    // Permite apenas Supabase Cloud (https://*.supabase.co) ou desenvolvimento local
    const isSupabase = parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
    const isLocal = (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
                    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

    if (isSupabase || isLocal) {
      return custom.replace(/\/+$/, '');
    }
  } catch {
    // URL inválida, usa fallback seguro
  }

  console.warn('⚠️ URL de funções personalizada ignorada por segurança (deve ser *.supabase.co ou localhost)');
  return DEFAULT_URL;
}

function getValidAnonKey() {
  const key = window.localStorage.getItem('orcamento_anon_key');
  if (!key || typeof key !== 'string') return '';
  return key.trim().replace(/[\r\n]/g, '');
}

window.APP_CONFIG = {
  // URL base para as Edge Functions do Supabase Cloud (validada)
  SUPABASE_FUNCTIONS_URL: getValidFunctionsUrl(),

  // Chave pública anônima do Supabase (sanitizada)
  SUPABASE_ANON_KEY: getValidAnonKey(),

  // Modo offline/demo desativado por padrão para usar backend real
  DEMO_MODE: window.localStorage.getItem('orcamento_demo_mode') === 'true',
};

